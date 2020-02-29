rm -rf /opt/airmash/www/airmash.online
mkdir /opt/airmash/www/airmash.online
cp -r ~/tmp/airmash-frontend-$1/* /opt/airmash/www/airmash.online
mv /opt/airmash/www/airmash.online/index.html /opt/airmash/www/airmash.online/index
mv /opt/airmash/www/airmash.online/contact.html /opt/airmash/www/airmash.online/contact
mv /opt/airmash/www/airmash.online/privacy.html /opt/airmash/www/airmash.online/privacy
