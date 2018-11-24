#!/bin/bash

update-games() {
  curl https://airma.sh/games > ~/airmash/games.current
  echo >> ~/airmash/games.log
  echo >> ~/airmash/games.log
  date >> ~/airmash/games.log
  cat ~/airmash/games.current >> ~/airmash/games.log
  # rewrite country to xx and strip off the -s1 suffix on host
  cat ~/airmash/games.current | sed 's/"country":".."/"country":"xx"/' | sed 's/-s1\\"/\\"/g' > /var/www/html/games.tmp
  mv /var/www/html/games.tmp /var/www/html/games
}

update-games
sleep 30
update-games
