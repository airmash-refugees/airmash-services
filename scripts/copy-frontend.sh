SRC_BASE=/opt/airmash/www/airmash.online
DEST_BASE=https://airmashonline.blob.core.windows.net
DEST_SAS=`cat /opt/airmash/data/ao-blob-sas.txt`

copy() {
  azcopy cp "${SRC_BASE}/${1}" "${DEST_BASE}/\$web/${1}?${DEST_SAS}" --content-type "${2}" --overwrite true
}

copy index "text/html; charset=utf-8"

copy assets/engine.js "application/javascript; charset=utf-8"
copy assets/engine.js.map application/json

copy contact "text/html; charset=utf-8"
copy privacy "text/html; charset=utf-8"

copy ping application/json

copy robots.txt text/plain

copy assets/map.json application/json

copy assets/content.css text/css
copy assets/flags.css text/css
copy assets/style.css text/css

copy assets/aircraft.png image/png
copy assets/favicon.png image/png
copy assets/flagsbig.png image/png
copy assets/gui.png image/png
copy assets/items.png image/png
copy assets/mountains.png image/png
copy assets/particles.png image/png
copy assets/shadows.png image/png

copy assets/map_forest.jpg image/jpeg
copy assets/map_rock.jpg image/jpeg
copy assets/map_rock_mask.jpg image/jpeg
copy assets/map_sand.jpg image/jpeg
copy assets/map_sand_mask.jpg image/jpeg
copy assets/map_sea.jpg image/jpeg
copy assets/map_sea_mask.jpg image/jpeg

copy assets/montserrat-bold.woff font/woff
copy assets/montserrat-extrabold.woff font/woff
copy assets/montserrat-semibold.woff font/woff

copy assets/montserrat-bold.woff2 font/woff2
copy assets/montserrat-extrabold.woff2 font/woff2
copy assets/montserrat-semibold.woff2 font/woff2

copy assets/sounds.mp3 audio/mpeg

