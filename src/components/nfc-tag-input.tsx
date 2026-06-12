"use client";

import { useEffect, useState } from "react";
import { buttonClass, Input } from "@/components/ui";

// NFC tag UID field with a "Scan" button: on an Android Chrome phone, tap a
// blank/physical card to auto-fill its serial number — no typing UIDs by hand.
// Falls back to manual entry where Web NFC isn't available (iPhone/desktop).
export function NfcTagInput({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  async function scan() {
    setErr(null);
    try {
      const reader = new (window as unknown as { NDEFReader: new () => any }).NDEFReader();
      await reader.scan();
      setScanning(true);
      reader.onreading = (e: { serialNumber?: string }) => {
        if (e.serialNumber) {
          setValue(e.serialNumber);
          setScanning(false);
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(60);
        }
      };
      reader.onreadingerror = () => {
        setScanning(false);
        setErr("Couldn't read the tag — hold it steady and retry.");
      };
    } catch (e) {
      setScanning(false);
      setErr((e as Error)?.message ?? "NFC unavailable on this device.");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          name="nfc_tag_uid"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="04A1B2C3"
          className="flex-1 font-mono"
        />
        {supported && (
          <button type="button" onClick={scan} className={buttonClass("secondary", "shrink-0")}>
            {scanning ? "Hold tag…" : "📲 Scan"}
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
