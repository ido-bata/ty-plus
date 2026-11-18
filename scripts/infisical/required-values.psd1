@{
	# Single source of truth for the Infisical value names that the runner
	# clears on its way in (ManagedNames) and the names the doctor asserts
	# every required value is present for (RequiredValues). Both scripts
	# import this file so the two lists cannot drift.

	ManagedNames = @(
		'ZXP_CERT_PASSWORD'
	)

	RequiredValues = @(
		'ZXP_CERT_PASSWORD'
	)
}
