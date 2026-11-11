//! Adversarial tests for retained host-root scanning.

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod capability_tests {
    use super::super::{install_after_anchor_hook, scan_roots, HostScanRoot, MAX_SCAN_DEPTH};
    use std::path::PathBuf;

    #[cfg(target_os = "windows")]
    fn create_reparse_directory_link(link: &std::path::Path, target: &std::path::Path) {
        std::os::windows::fs::symlink_dir(target, link).unwrap_or_else(|error| {
            panic!(
                "environment error: cannot create directory reparse link {} -> {}: {error}",
                link.display(),
                target.display()
            )
        });
    }

    #[cfg(target_os = "windows")]
    fn plugin_file(stem: &str) -> String {
        format!("{stem}.aex")
    }

    #[cfg(target_os = "macos")]
    fn plugin_file(stem: &str) -> String {
        format!("{stem}.plugin")
    }

    #[test]
    fn host_scan_root_scans_relative_plugins_without_process_cwd() {
        // Production break caught: scan must open the supplied app root once and
        // never reinterpret a relative payload root against process CWD.
        let temp = tempfile::tempdir().expect("temporary app root");
        std::fs::create_dir_all(temp.path().join("Plugins")).unwrap();
        std::fs::write(
            temp.path().join("Plugins").join(plugin_file("demo")),
            b"plugin",
        )
        .unwrap();
        let capability = HostScanRoot::open(temp.path()).expect("open host root");

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert_eq!(result.rows.len(), 1);
        assert!(
            result.rows[0]
                .file_path
                .ends_with(&format!("Plugins\\{}", plugin_file("demo")))
                || result.rows[0]
                    .file_path
                    .ends_with(&format!("Plugins/{}", plugin_file("demo")))
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn host_scan_root_stops_at_the_depth_cap() {
        let temp = tempfile::tempdir().expect("temporary app root");
        let mut current = temp.path().join("Plugins");
        std::fs::create_dir_all(&current).unwrap();
        for index in 0..=MAX_SCAN_DEPTH {
            current = current.join(format!("level-{index}"));
            std::fs::create_dir(&current).unwrap();
        }
        std::fs::write(current.join("too-deep.aex"), b"plugin").unwrap();

        let capability = HostScanRoot::open(temp.path()).expect("open host root");
        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert!(result.rows.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("depth limit")));
    }

    #[test]
    fn host_scan_root_rejects_escape_and_empty_components() {
        // Production break caught: capability-relative roots must reject every
        // path spelling that could widen authority beyond the retained root.
        let temp = tempfile::tempdir().expect("temporary app root");
        let capability = HostScanRoot::open(temp.path()).expect("open host root");
        for root in [
            PathBuf::from("/absolute"),
            PathBuf::from("../parent"),
            PathBuf::from("C:\\drive"),
            PathBuf::from("\\\\server\\share"),
            PathBuf::from("Plugins//Nested"),
            PathBuf::from("."),
            PathBuf::new(),
        ] {
            assert!(
                capability.open_relative(&root).is_err(),
                "accepted {root:?}"
            );
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn host_scan_root_rejects_final_and_intermediate_reparse_components() {
        let parent = tempfile::tempdir().expect("temporary parent");
        let external = parent.path().join("external");
        std::fs::create_dir_all(external.join("child")).unwrap();

        let final_link = parent.path().join("final-reparse-link");
        create_reparse_directory_link(&final_link, &external);
        assert!(
            HostScanRoot::open(&final_link).is_err(),
            "final reparse link must not become an app-root capability"
        );

        let intermediate_root = parent.path().join("intermediate-root");
        std::fs::create_dir_all(&intermediate_root).unwrap();
        let intermediate_link = intermediate_root.join("redirect");
        create_reparse_directory_link(&intermediate_link, &external);
        assert!(
            HostScanRoot::open(intermediate_link.join("child")).is_err(),
            "intermediate reparse link must not become an app-root capability"
        );
    }

    #[test]
    fn host_scan_root_retains_original_tree_after_app_root_replacement() {
        // Production break caught: replacing the ambient app-root path after
        // capability creation must not redirect scans to a new tree.
        let parent = tempfile::tempdir().expect("temporary parent");
        let original = parent.path().join("app");
        let replacement = parent.path().join("replacement");
        std::fs::create_dir_all(original.join("Plugins")).unwrap();
        std::fs::write(
            original.join("Plugins").join(plugin_file("original")),
            b"original",
        )
        .unwrap();
        let capability = HostScanRoot::open(&original).expect("open host root");

        if let Err(error) = std::fs::rename(&original, &replacement) {
            assert_eq!(
                error.raw_os_error(),
                Some(32),
                "unexpected replacement error: {error}"
            );
            let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();
            assert_eq!(result.rows.len(), 1);
            assert!(result.rows[0].file_path.ends_with(&plugin_file("original")));
            return;
        }
        std::fs::create_dir_all(original.join("Plugins")).unwrap();
        std::fs::write(
            original.join("Plugins").join(plugin_file("replacement")),
            b"replacement",
        )
        .unwrap();

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert_eq!(result.rows.len(), 1);
        assert!(result.rows[0].file_path.ends_with(&plugin_file("original")));
    }

    #[test]
    fn child_scan_keeps_the_first_anchor_when_path_is_replaced_after_open() {
        let parent = tempfile::tempdir().expect("temporary parent");
        let original = parent.path().join("app");
        let external = parent.path().join("external");
        let plugins = original.join("Plugins");
        std::fs::create_dir_all(&plugins).unwrap();
        std::fs::create_dir_all(&external).unwrap();
        std::fs::write(plugins.join(plugin_file("original")), b"original").unwrap();
        std::fs::write(external.join(plugin_file("external")), b"external").unwrap();
        let capability = HostScanRoot::open(&original).expect("open host root");
        let moved = parent.path().join("moved-plugins");
        let replacement = plugins.clone();
        let external_for_hook = external.clone();
        install_after_anchor_hook(Box::new(move || {
            if let Err(error) = std::fs::rename(&replacement, &moved) {
                assert_eq!(
                    error.raw_os_error(),
                    Some(32),
                    "unexpected replacement error: {error}"
                );
                return;
            }
            #[cfg(target_os = "windows")]
            create_reparse_directory_link(&replacement, &external_for_hook);
            #[cfg(target_os = "macos")]
            std::os::unix::fs::symlink(&external_for_hook, &replacement)
                .expect("environment error: child replacement symlink unavailable");
        }));

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert_eq!(result.rows.len(), 1);
        assert!(result.rows[0].file_path.ends_with(&plugin_file("original")));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn host_scan_root_rejects_reparse_replacement_without_external_read() {
        // Production break caught: a directory reparse replacement must not redirect a
        // retained directory capability to an external sentinel tree.
        let parent = tempfile::tempdir().expect("temporary parent");
        let original = parent.path().join("app");
        let external = parent.path().join("external");
        std::fs::create_dir_all(original.join("Plugins")).unwrap();
        std::fs::create_dir_all(&external).unwrap();
        std::fs::write(original.join("Plugins/original.aex"), b"original").unwrap();
        std::fs::write(external.join("sentinel.aex"), b"external").unwrap();
        let capability = HostScanRoot::open(&original).expect("open host root");

        let reparse_link = original.join("Plugins");
        let moved = parent.path().join("moved");
        if let Err(error) = std::fs::rename(&original, &moved) {
            assert_eq!(
                error.raw_os_error(),
                Some(32),
                "unexpected replacement error: {error}"
            );
            let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();
            assert_eq!(result.rows.len(), 1);
            assert!(result.rows[0].file_path.ends_with("original.aex"));
            return;
        }
        std::fs::create_dir_all(&original).unwrap();
        create_reparse_directory_link(&reparse_link, &external);

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert_eq!(result.rows.len(), 1);
        assert!(result.rows[0].file_path.ends_with("original.aex"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn host_scan_root_skips_nested_reparse_without_external_read() {
        // Production break caught: nested directory reparse links must fail closed rather than
        // reading a plugin sentinel outside the retained capability.
        let parent = tempfile::tempdir().expect("temporary parent");
        let root = parent.path().join("app");
        let external = parent.path().join("external");
        std::fs::create_dir_all(root.join("Plugins")).unwrap();
        std::fs::create_dir_all(&external).unwrap();
        std::fs::write(external.join("sentinel.aex"), b"external").unwrap();
        let reparse_link = root.join("Plugins/escape");
        create_reparse_directory_link(&reparse_link, &external);
        let capability = HostScanRoot::open(&root).expect("open host root");

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert!(result.rows.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("unsafe")));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn host_scan_root_skips_symlink_replacement_without_external_read() {
        // Production break caught: a symlink replacement must not redirect a
        // retained directory capability to an external sentinel tree.
        use std::os::unix::fs::symlink;

        let parent = tempfile::tempdir().expect("temporary parent");
        let original = parent.path().join("app");
        let external = parent.path().join("external");
        std::fs::create_dir_all(original.join("Plugins")).unwrap();
        std::fs::create_dir_all(&external).unwrap();
        std::fs::write(original.join("Plugins/original.plugin"), b"original").unwrap();
        std::fs::write(external.join("sentinel.plugin"), b"external").unwrap();
        let capability = HostScanRoot::open(&original).expect("open host root");

        let moved = parent.path().join("moved");
        std::fs::rename(&original, &moved).unwrap();
        std::fs::create_dir_all(&original).unwrap();
        symlink(&external, original.join("Plugins")).unwrap();

        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        assert_eq!(result.rows.len(), 1);
        assert!(result.rows[0].file_path.ends_with("original.plugin"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn host_scan_root_rejects_final_and_intermediate_symlink_components() {
        use std::os::unix::fs::symlink;

        let parent = tempfile::tempdir().expect("temporary parent");
        let external = parent.path().join("external");
        std::fs::create_dir_all(external.join("child")).unwrap();

        let final_symlink = parent.path().join("final-symlink");
        symlink(&external, &final_symlink).expect("environment error: final symlink setup");
        assert!(
            HostScanRoot::open(&final_symlink).is_err(),
            "final symlink must not become an app-root capability"
        );

        let intermediate_root = parent.path().join("intermediate-root");
        std::fs::create_dir_all(&intermediate_root).unwrap();
        let intermediate_symlink = intermediate_root.join("redirect");
        symlink(&external, &intermediate_symlink)
            .expect("environment error: intermediate symlink setup");
        assert!(
            HostScanRoot::open(intermediate_symlink.join("child")).is_err(),
            "intermediate symlink must not become an app-root capability"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_packages_scan_retained_extensionless_executables() {
        let temp = tempfile::tempdir().expect("temporary app root");
        for extension in ["plugin", "component", "bundle"] {
            let executable = temp
                .path()
                .join("Plugins")
                .join(format!("Demo.{extension}"))
                .join("Contents/MacOS/demo-executable");
            let executable_name = macos_package_executable_name(extension);
            let executable = executable.parent().unwrap().join(executable_name);
            std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
            std::fs::write(executable, b"executable").unwrap();
        }

        let capability = HostScanRoot::open(temp.path()).expect("open host root");
        let result = scan_roots(&capability, &[PathBuf::from("Plugins")]).unwrap();

        // A walk that finds nothing reports the reason on `warnings` — an
        // unopenable package, an entry that refuses to enumerate — and none of
        // it reaches the row count. Carry both into the assertion so a failure
        // says which entry went wrong rather than only that three rows were
        // missing.
        assert_eq!(
            result.rows.len(),
            3,
            "all package kinds must be traversed, got rows {:?} and warnings {:?}",
            result
                .rows
                .iter()
                .map(|row| row.file_path.as_str())
                .collect::<Vec<_>>(),
            result.warnings,
        );
        for extension in ["plugin", "component", "bundle"] {
            let executable_name = macos_package_executable_name(extension);
            let row = result
                .rows
                .iter()
                .find(|row| row.file_path.contains(&format!("Demo.{extension}")))
                .unwrap_or_else(|| panic!("each package must produce a row, missing {extension}"));
            assert!(row.file_path.ends_with(executable_name));
            assert_eq!(row.match_name, format!("macOS Plugin: {executable_name}"));
        }
    }

    #[cfg(target_os = "macos")]
    fn macos_package_executable_name(extension: &str) -> &'static str {
        match extension {
            "plugin" => "demo-plugin-executable",
            "component" => "demo-component-executable",
            "bundle" => "demo-bundle-executable",
            _ => panic!("unsupported package extension: {extension}"),
        }
    }
}
