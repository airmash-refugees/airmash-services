# responds to DNS-01 challenge, requires this record in zone so requests end up here:
#   _acme-challenge.airmash.online. 300 IN NS airmash.online.

from dnslib import *
import socket
import threading

def read_zone():
    with open("acmedns.txt", "r") as f:
      lines = f.readlines()
    zone = {}
    for i in range(0, len(lines)-1, 2):
        k = lines[i].strip()
        v = lines[i+1].strip()
        if k[-1] <> '.':
            k += '.'
        k = "_acme-challenge."+k.lower()
        if k in zone:
            zone[k].append(v)
        else:
            zone[k] = [v]
    print(zone)
    return zone

def dns_server():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", 53))
    while True:
      (data, addr) = s.recvfrom(65536)
      print("=== received from " + addr[0] + ":" + str(addr[1]))
      req = DNSRecord.parse(data)
      print(req)
      zone = read_zone()
      if req.q.qtype == QTYPE.TXT:
          lname = str(req.q.qname).lower() 
          if lname in zone:
              print("=== responding")
              res = DNSRecord(DNSHeader(id=req.header.id, qr=1, aa=1, ra=1), q=req.q)
              for token in zone[lname]:
                res.add_answer(RR(req.q.qname, req.q.qtype, rdata=TXT(token), ttl=60))
              print(res)
              s.sendto(res.pack(), addr)

t = threading.Thread(target=dns_server)
t.daemon = True
t.start()

time.sleep(60)
