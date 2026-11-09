package agent

import "testing"

func TestApplianceDescriptorAdvertisesFleetContract(t *testing.T) {
	descriptor := applianceDescriptor(false)
	if descriptor["generation"] != "showroom-appliance-v2" {
		t.Fatalf("unexpected appliance generation: %v", descriptor["generation"])
	}
	if descriptor["protocolVersion"] != 2 {
		t.Fatalf("unexpected protocol version: %v", descriptor["protocolVersion"])
	}
	capabilities, ok := descriptor["capabilities"].([]string)
	if !ok {
		t.Fatalf("capabilities must be []string, got %T", descriptor["capabilities"])
	}
	required := map[string]bool{
		"appliance_telemetry":   false,
		"app_slot_rollback":     false,
		"leased_commands":       false,
		"network_rotation":      false,
		"signed_releases":       false,
		"staged_rollouts":       false,
		"transactional_content": false,
	}
	for _, capability := range capabilities {
		if _, exists := required[capability]; exists {
			required[capability] = true
		}
	}
	for capability, present := range required {
		if !present {
			t.Errorf("missing capability %q", capability)
		}
	}
}

func TestApplianceDescriptorAdvertisesSystemBundlesOnlyWhenConfigured(t *testing.T) {
	has := func(descriptor map[string]interface{}) bool {
		for _, capability := range descriptor["capabilities"].([]string) {
			if capability == "system_bundles" {
				return true
			}
		}
		return false
	}
	if has(applianceDescriptor(false)) {
		t.Fatal("system_bundles advertised without an OS installer")
	}
	if !has(applianceDescriptor(true)) {
		t.Fatal("system_bundles missing with an OS installer")
	}
}
