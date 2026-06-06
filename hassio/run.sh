#!/usr/bin/with-contenv bashio

# Read options from HA add-on config
DATA_FOLDER=$(bashio::config 'data_folder')
DEBUG=$(bashio::config 'debug')

# Create data and media directories under /share
mkdir -p "${DATA_FOLDER}/data"
mkdir -p "${DATA_FOLDER}/media/originals"
mkdir -p "${DATA_FOLDER}/media/thumbnails"

bashio::log.info "FamilyRoot starting..."
bashio::log.info "Data folder: ${DATA_FOLDER}"

# Export env vars for the Flask app
export PORT=5050
export DEBUG=$([ "$DEBUG" = "true" ] && echo "1" || echo "0")
export FAMILYROOT_DATA="${DATA_FOLDER}/data"
export FAMILYROOT_MEDIA="${DATA_FOLDER}/media"
export FAMILYROOT_DB="${DATA_FOLDER}/data/familyroot.db"

cd /app/backend
exec python app.py
