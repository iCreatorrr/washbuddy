import React, { useState, useRef } from "react";
import { Button } from "@/components/ui";
import { Camera, X, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface PhotoPromptProps {
  bookingId: string;
  photoType: "BEFORE" | "AFTER";
  onComplete: () => void;
}

export function PhotoPrompt({ bookingId, photoType, onComplete }: PhotoPromptProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUsePhoto = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // Compress via canvas
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((r) => (img.onload = r));
      const canvas = document.createElement("canvas");
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.8));

      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");
      formData.append("photoType", photoType);

      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/photos`, { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Photo saved");
      setTimeout(onComplete, 500);
    } catch {
      toast.error("Photo upload failed");
      onComplete();
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onComplete}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Take a '{photoType.toLowerCase()}' photo?</h3>
        <p className="text-sm text-slate-500 mb-4">Recommended — helps with quality assurance and dispute resolution</p>

        {preview ? (
          <div className="space-y-3">
            <img src={preview} className="w-full h-48 object-cover rounded-xl" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => { setPreview(null); setFile(null); fileInputRef.current?.click(); }}>
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
              <Button className="flex-1 gap-1" onClick={handleUsePhoto} isLoading={uploading}>
                <Check className="h-4 w-4" /> Use Photo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button className="flex-1 gap-2" onClick={() => fileInputRef.current?.click()}>
              <Camera className="h-4 w-4" /> Open Camera
            </Button>
            <Button variant="outline" className="flex-1" onClick={onComplete}>Skip</Button>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} className="hidden" />
      </div>
    </div>
  );
}
