#!/bin/bash
set -e

BACKUP_DIR="/home/molmathe/Fonneygroup/Stockcutoff/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
FILE="$BACKUP_DIR/stockcutoff_$TIMESTAMP.sql.gz"

echo "[$(date)] Starting backup..."

# Dump and compress
docker exec stockcutoff-postgres pg_dump -U stockcutoff stockcutoff | gzip > "$FILE"

echo "[$(date)] Dump saved: $FILE"

# Upload to Google Drive folder "Stockcutoff-Backups"
rclone copy "$FILE" gdrive:Stockcutoff-Backups/ --progress

echo "[$(date)] Uploaded to Google Drive: Stockcutoff-Backups/$(basename $FILE)"

# Keep only last 7 local files
ls -t "$BACKUP_DIR"/stockcutoff_*.sql.gz | tail -n +8 | xargs -r rm --

echo "[$(date)] Done."
