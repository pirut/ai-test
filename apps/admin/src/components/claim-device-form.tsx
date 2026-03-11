"use client";

import { startTransition, useState } from "react";

export function ClaimDeviceForm() {
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("Claiming device...");

    const response = await fetch("/api/devices/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        claimCode: formData.get("claimCode"),
        name: formData.get("name"),
        siteName: formData.get("siteName"),
      }),
    });

    const payload = await response.json();
    setStatus(response.ok ? `Claimed ${payload.deviceId}` : payload.error ?? "Claim failed");
  }

  return (
    <form
      className="panel formPanel"
      action={(formData) => startTransition(() => void handleSubmit(formData))}
    >
      <div className="sectionTitle">
        <span className="eyebrow">Provisioning</span>
        <h2>Claim a screen</h2>
      </div>
      <label>
        Claim code
        <input name="claimCode" placeholder="123456" required />
      </label>
      <label>
        Screen name
        <input name="name" placeholder="Front Window" required />
      </label>
      <label>
        Site
        <input name="siteName" placeholder="Chelsea showroom" required />
      </label>
      <button type="submit">Claim device</button>
      {status ? <p className="formStatus">{status}</p> : null}
    </form>
  );
}

