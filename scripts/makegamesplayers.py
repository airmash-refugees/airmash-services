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
  if d[-1]=='\n':
    d = d[:-1]
  d = d.split('\n')
  d = [r.split('|') for r in d]
  return d

def jdump(j):
  return json.dumps(j, separators=(',',':'))

def scriptpath(relpath):
  return os.path.join(sys.path[0], relpath)

# regions.txt format:
#   0  1
#   id|name
regions = parsetxt(scriptpath("../regions.txt"))

data = []
regiongames = {}
for row in regions:
  log(row)
  regiongames[row[0]] = []
  data.append(
    {"name"  : row[1],
     "id"    : row[0],
     "games" : regiongames[row[0]]})

# games.txt format:
#   0         1    2  3    4         5
#   region_id|type|id|name|nameShort|host
games = parsetxt(scriptpath("../games.txt"))

ua = {"User-Agent":"airmash.online frontend"}

for row in games:
  log(row)
  url = "https://" + row[5] + "/" + row[2].split('?')[0]
  log(url)
  players = 0
  try:
    j = json.loads(urlopen(Request(url, headers=ua)).read())
    players = int(j['players'])
  except Exception as e:
    traceback.print_exc()
  finally:
    log(players)
  regiongames[row[0]].append(
    {"type"      : int(row[1]),
     "id"        : row[2],
     "name"      : row[3],
     "nameShort" : row[4],
     "players"   : players,
     "host"      : row[5]})

j = {"data"     : jdump(data),
     "country"  : "xx",
     "protocol" : 5}
print(jdump(j))

