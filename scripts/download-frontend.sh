mkdir -p ~/tmp
curl "https://dev.azure.com/airmash/ea5ee008-e388-4e27-b630-b6128172b498/_apis/build/builds/$1/artifacts?artifactName=airmash-refugees%2Fairmash-frontend&api-version=6.0-preview.5&%24format=zip" > ~/tmp/airmash-frontend-$1.zip
rm -rf ~/tmp/out
unzip ~/tmp/airmash-frontend-$1.zip -d ~/tmp/out
mv ~/tmp/out/airmash-refugees/airmash-frontend ~/tmp
mv ~/tmp/airmash-frontend ~/tmp/airmash-frontend-$1
rm -rf ~/tmp/out
