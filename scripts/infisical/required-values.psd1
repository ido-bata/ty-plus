@{
	# Single source of truth for the Infisical value names that the runner
	# clears on its way in (ManagedNames) and the names the doctor asserts
	# every required value is present for (RequiredValues). Both scripts
	# import this file so the two lists cannot drift.

	ManagedNames = @(
		'NOTION_TOKEN'
		'SYNC_TOKEN'
		'ZXP_CERT_PASSWORD'
		'SUPABASE_URL'
		'SUPABASE_PUBLISHABLE_KEY'
	)

	RequiredValues = @(
		'NOTION_TOKEN'
		'SYNC_TOKEN'
		'SUPABASE_URL'
		'SUPABASE_PUBLISHABLE_KEY'
	)
}