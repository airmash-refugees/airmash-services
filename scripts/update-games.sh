#!/bin/bash
update-games() {
  date >> ~/airmash/makegamesplayers.log
  ~/airmash/scripts/makegamesplayers.py > /var/www/html/games.tmp 2>> ~/airmash/makegamesplayers.log
  echo >> ~/airmash/games.log
  echo >> ~/airmash/games.log
  date >> ~/airmash/games.log
  cat /var/www/html/games.tmp >> ~/airmash/games.log
  mv /var/www/html/games.tmp /var/www/html/games
}

date
update-games
sleep 30
update-games
