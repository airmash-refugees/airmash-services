#!/usr/bin/env bash

DIR=`dirname "$0"`

update-games() {
  date >> $DIR/../logs/makegamesplayers.log
  $DIR/makegamesplayers.py >> $DIR/../logs/makegamesplayers.log 2>&1

  date >> $DIR/../logs/gamesjson.log
  cat $DIR/../data/games.json >> $DIR/../logs/gamesjson.log
  echo >> $DIR/../logs/gamesjson.log

  date >> $DIR/../logs/gamestestjson.log
  cat $DIR/../data/games-test.json >> $DIR/../logs/gamestestjson.log
  echo >> $DIR/../logs/gamestestjson.log
}

date
update-games
sleep 25
date
update-games
