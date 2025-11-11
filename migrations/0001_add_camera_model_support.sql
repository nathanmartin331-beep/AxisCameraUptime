-- Migration: Add camera model support
-- Description: Add fields for camera model detection, capabilities, and firmware information
-- Created: 2025-11-11
-- Phase: Foundation (Phase 1)

-- Add basic model information fields
ALTER TABLE cameras ADD COLUMN model TEXT;
ALTER TABLE cameras ADD COLUMN series TEXT;
ALTER TABLE cameras ADD COLUMN full_name TEXT;

-- Add firmware and hardware information
ALTER TABLE cameras ADD COLUMN firmware_version TEXT;
ALTER TABLE cameras ADD COLUMN vapix_version TEXT;

-- Add capability flags (boolean fields for fast queries)
ALTER TABLE cameras ADD COLUMN has_ptz INTEGER DEFAULT 0;
ALTER TABLE cameras ADD COLUMN has_audio INTEGER DEFAULT 0;
ALTER TABLE cameras ADD COLUMN audio_channels INTEGER DEFAULT 0;
ALTER TABLE cameras ADD COLUMN number_of_views INTEGER DEFAULT 1;

-- Add detailed capabilities (JSON for extensibility)
ALTER TABLE cameras ADD COLUMN capabilities TEXT;

-- Add detection metadata
ALTER TABLE cameras ADD COLUMN detected_at INTEGER;
ALTER TABLE cameras ADD COLUMN detection_method TEXT;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cameras_model ON cameras(model);
CREATE INDEX IF NOT EXISTS idx_cameras_series ON cameras(series);
CREATE INDEX IF NOT EXISTS idx_cameras_has_ptz ON cameras(has_ptz);
CREATE INDEX IF NOT EXISTS idx_cameras_has_audio ON cameras(has_audio);

-- Rollback instructions:
-- DROP INDEX IF EXISTS idx_cameras_model;
-- DROP INDEX IF EXISTS idx_cameras_series;
-- DROP INDEX IF EXISTS idx_cameras_has_ptz;
-- DROP INDEX IF EXISTS idx_cameras_has_audio;
-- Note: SQLite does not support DROP COLUMN, so rollback requires recreating the table
