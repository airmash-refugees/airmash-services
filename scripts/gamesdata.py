#!/usr/bin/env python3
import sys
import json

j = json.loads(sys.stdin.read())
d = json.loads(j['data'])
json.dump(d, sys.stdout, indent=4)

