use std::collections::BTreeSet;
use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::validation::{validate_qualified_name, ValidationError};

pub const CURRENT_PROTOCOL_VERSION: ProtocolVersion = ProtocolVersion::new(1, 0);
pub const MAX_CAPABILITIES: usize = 128;
pub const MAX_CAPABILITY_NAME_BYTES: usize = 128;

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProtocolVersion {
    pub major: u16,
    pub minor: u16,
}

impl ProtocolVersion {
    #[must_use]
    pub const fn new(major: u16, minor: u16) -> Self {
        Self { major, minor }
    }

    #[must_use]
    pub const fn compatibility_with(self, peer: Self) -> ProtocolCompatibility {
        if self.major != peer.major {
            ProtocolCompatibility::IncompatibleMajor
        } else if self.minor == peer.minor {
            ProtocolCompatibility::Exact
        } else {
            ProtocolCompatibility::CompatibleMinor {
                negotiated_minor: if self.minor < peer.minor {
                    self.minor
                } else {
                    peer.minor
                },
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolCompatibility {
    Exact,
    CompatibleMinor { negotiated_minor: u16 },
    IncompatibleMajor,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct CapabilityName(String);

impl CapabilityName {
    pub fn parse(value: impl Into<String>) -> Result<Self, ValidationError> {
        let value = value.into();
        validate_capability_name(&value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for CapabilityName {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(value).map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for CapabilityName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

fn validate_capability_name(value: &str) -> Result<(), ValidationError> {
    validate_qualified_name("capability", value, MAX_CAPABILITY_NAME_BYTES)
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CapabilitySet(BTreeSet<CapabilityName>);

impl CapabilitySet {
    pub fn new(
        capabilities: impl IntoIterator<Item = CapabilityName>,
    ) -> Result<Self, ValidationError> {
        let capabilities = capabilities.into_iter().collect::<BTreeSet<_>>();
        if capabilities.len() > MAX_CAPABILITIES {
            return Err(ValidationError::TooManyCapabilities {
                max: MAX_CAPABILITIES,
                actual: capabilities.len(),
            });
        }
        Ok(Self(capabilities))
    }

    #[must_use]
    pub fn contains(&self, capability: &CapabilityName) -> bool {
        self.0.contains(capability)
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn intersection(&self, peer: &Self) -> Self {
        Self(self.0.intersection(&peer.0).cloned().collect())
    }
}

impl Serialize for CapabilitySet {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for CapabilitySet {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let capabilities = BTreeSet::<CapabilityName>::deserialize(deserializer)?;
        Self::new(capabilities).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NegotiatedProtocol {
    pub version: ProtocolVersion,
    pub capabilities: CapabilitySet,
}

impl NegotiatedProtocol {
    #[must_use]
    pub fn negotiate(
        local_version: ProtocolVersion,
        local_capabilities: &CapabilitySet,
        peer_version: ProtocolVersion,
        peer_capabilities: &CapabilitySet,
    ) -> Option<Self> {
        match local_version.compatibility_with(peer_version) {
            ProtocolCompatibility::IncompatibleMajor => None,
            ProtocolCompatibility::Exact => Some(Self {
                version: local_version,
                capabilities: local_capabilities.intersection(peer_capabilities),
            }),
            ProtocolCompatibility::CompatibleMinor { negotiated_minor } => Some(Self {
                version: ProtocolVersion::new(local_version.major, negotiated_minor),
                capabilities: local_capabilities.intersection(peer_capabilities),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compatibility_table_is_major_strict_and_minor_negotiated() {
        let cases = [
            ((1, 0), (1, 0), ProtocolCompatibility::Exact),
            (
                (1, 3),
                (1, 1),
                ProtocolCompatibility::CompatibleMinor {
                    negotiated_minor: 1,
                },
            ),
            ((1, 0), (2, 0), ProtocolCompatibility::IncompatibleMajor),
        ];
        for (local, peer, expected) in cases {
            assert_eq!(
                ProtocolVersion::new(local.0, local.1)
                    .compatibility_with(ProtocolVersion::new(peer.0, peer.1)),
                expected
            );
        }
    }

    #[test]
    fn capability_negotiation_is_a_sorted_intersection() {
        let local = CapabilitySet::new([
            CapabilityName::parse("runtime.health").unwrap(),
            CapabilityName::parse("storage.read").unwrap(),
        ])
        .unwrap();
        let peer = CapabilitySet::new([
            CapabilityName::parse("online.fetch").unwrap(),
            CapabilityName::parse("runtime.health").unwrap(),
        ])
        .unwrap();
        let negotiated = NegotiatedProtocol::negotiate(
            ProtocolVersion::new(1, 2),
            &local,
            ProtocolVersion::new(1, 1),
            &peer,
        )
        .unwrap();
        assert_eq!(negotiated.version, ProtocolVersion::new(1, 1));
        assert_eq!(negotiated.capabilities.len(), 1);
        assert!(negotiated
            .capabilities
            .contains(&CapabilityName::parse("runtime.health").unwrap()));
    }

    #[test]
    fn invalid_capability_names_fail_during_deserialization() {
        for invalid in [
            r#""Runtime.Health""#,
            r#""runtime..health""#,
            r#""runtime/health""#,
        ] {
            assert!(serde_json::from_str::<CapabilityName>(invalid).is_err());
        }
    }

    #[test]
    fn capability_limit_is_enforced_during_deserialization() {
        let names = (0..=MAX_CAPABILITIES)
            .map(|index| format!("runtime.capability-{index}"))
            .collect::<Vec<_>>();
        assert!(serde_json::from_value::<CapabilitySet>(serde_json::json!(names)).is_err());
    }
}
