#!/bin/bash
html-tidy() { 
  tidy -q -i -utf8 -w 1337 $1 | grep -v HTML\ Tidy
}

run() {
  $1 static/$2 > static-beautified/$2
}

run html-tidy index
run html-tidy changelog
run html-tidy contact
run html-tidy privacy 
run js-beautify assets/engine.js 
