import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router: IRouter = Router();

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const bookingId = req.params.bookingId;
    const dir = path.join(process.cwd(), "uploads", "photos", bookingId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

router.post("/bookings/:bookingId/photos", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { bookingId } = req.params;
    const { photoType, caption } = req.body;
    const file = req.file;

    if (!file) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Image file required" }); return; }
    if (!photoType) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "photoType required" }); return; }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const objectKey = `photos/${bookingId}/${file.filename}`;
    const fileBuffer = fs.readFileSync(file.path);
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    const fileAsset = await prisma.fileAsset.create({
      data: {
        bucket: "local", objectKey, mimeType: file.mimetype,
        byteSize: file.size, sha256Hex: sha256,
        purposeCode: "BOOKING_PHOTO", uploadedByUserId: user.id,
      },
    });

    const photo = await prisma.bookingPhoto.create({
      data: { bookingId, uploadedBy: user.id, photoType, fileAssetId: fileAsset.id, caption: caption || null },
    });

    res.status(201).json({
      photoId: photo.id,
      photoUrl: `/api/uploads/${objectKey}`,
      photoType, caption: photo.caption,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to upload photo");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to upload photo" });
  }
});

router.get("/bookings/:bookingId/photos", requireAuth, async (req, res) => {
  try {
    const photos = await prisma.bookingPhoto.findMany({
      where: { bookingId: req.params.bookingId },
      include: { uploader: { select: { firstName: true, lastName: true } }, fileAsset: { select: { objectKey: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      photos: photos.map((p) => ({
        id: p.id, photoType: p.photoType,
        photoUrl: `/api/uploads/${p.fileAsset.objectKey}`,
        caption: p.caption,
        uploaderName: `${p.uploader.firstName} ${p.uploader.lastName}`,
        createdAt: p.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load photos" });
  }
});

export default router;
