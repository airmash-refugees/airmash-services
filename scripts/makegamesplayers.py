#!/usr/bin/env python3
import sys
import json
from urllib.request import urlopen, Request
import traceback
import os

def log(msg):
  print(msg, file=sys.stderr)

def parsetxt(filename):
  f = open(filename)
  d = f.read()
  f.close()
  if len(d) == 0:
    return []
  if d[-1]=='\n':
    d = d[:-1]
  d = d.split('\n')
  d = [r.split('|') for r in d]
  return d

def jdump(j):
  return json.dumps(j, separators=(',',':'))

def writejsonfile(filename, data):
  tmpfilename = filename + '.tmp'
  f = open(tmpfilename, 'w')
  f.write(jdump(data))
  f.close()
  os.rename(tmpfilename, filename)

def scriptpath(relpath):
  return os.path.join(sys.path[0], relpath)

def datafromregions(regions):
  # regions.txt format:
  #   0  1
  #   id|name
  data = []
  for row in regions:
    log(row)
    data.append(
      {'name'  : row[1],
       'id'    : row[0],
       'games' : []})
  return data

def addgamestodata(data, games):
  # games.txt format:
  #   0         1    2  3    4         5    6
  #   region_id|type|id|name|nameShort|host|path
  ua = {'User-Agent':'airmash.online'}
  for row in games:
    log(row)
    url = 'https://' + row[5] + '/' + row[6]
    log(url)
    players = None
    try:
      j = json.loads(urlopen(Request(url, headers=ua), timeout=5).read())
      players = int(j['players'])
    except Exception as e:
      traceback.print_exc()
    finally:
      log(players)
    for region in data:
      if region['id'] == row[0]:
        games = region['games']
        game = {'type'      : int(row[1]),
                'id'        : row[2],
                'name'      : row[3],
                'nameShort' : row[4],
                'host'      : row[5],
                'path'      : row[6]}
        if players != None:
          game['players'] = players
        games.append(game)

log('---- regions ---')
regions = parsetxt(scriptpath('../data/regions.txt'))
data = datafromregions(regions)

log('---- games ----')
games = parsetxt(scriptpath('../data/games.txt'))
addgamestodata(data, games)
writejsonfile(scriptpath('../data/games.json'), data)

# additional servers
log('---- games-test ----')
try:
  gamestest = parsetxt(scriptpath('../data/games-test.txt'))
  addgamestodata(data, gamestest)
except FileNotFoundError as e:
  print('games-test skipped, source data not found')
writejsonfile(scriptpath('../data/games-test.json'), data)

