mkdir -p ~/tmp
curl "https://dev.azure.com/airmash/ea5ee008-e388-4e27-b630-b6128172b498/_apis/build/builds/$1/artifacts?artifactName=spatiebot%2Fab-client&api-version=5.1&%24format=zip" > ~/tmp/ab-client-$1.zip
rm -rf ~/tmp/out
unzip ~/tmp/ab-client-$1.zip -d ~/tmp/out
mv ~/tmp/out/spatiebot/ab-client ~/tmp
mv ~/tmp/ab-client ~/tmp/ab-client-$1
rm -rf ~/tmp/out
rm -rf /opt/airmash/www/new.airmash.online
mkdir /opt/airmash/www/new.airmash.online
cp -r ~/tmp/ab-client-$1/* /opt/airmash/www/new.airmash.online
