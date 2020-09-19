const sqlite3 = require('better-sqlite3');
const path = require('path');
const paths = require('./paths');

/**
 * User login database
 */
let users = {};

users.db = sqlite3(path.resolve(paths.data, 'users.db'));
users.db.pragma('synchronous = FULL');
users.db.pragma('journal_mode = WAL');

users.db.exec('create table if not exists users ( user_id text not null primary key, external_id text not null unique )');

const usersInsert = users.db.prepare('insert into users (user_id, external_id) values (?,?)');
const usersSelectUserId = users.db.prepare('select * from users where user_id = ?');
const usersSelectExternalId = users.db.prepare('select * from users where external_id = ?');

users.addUser = (userId, externalId) => usersInsert.run(userId, externalId);
users.getUserByUserId = (userId) => usersSelectUserId.get(userId);
users.getUserByExternalId = (externalId) => usersSelectExternalId.get(externalId);

/**
 * User settings database
 */
let userSettings = {};

userSettings.db = sqlite3(path.resolve(paths.data, 'user-settings.db'));
userSettings.db.pragma('synchronous = FULL');
userSettings.db.pragma('journal_mode = WAL');

userSettings.db.exec('create table if not exists user_settings ( user_id text not null primary key, settings text )');

const userSettingsUpsert = userSettings.db.prepare('insert into user_settings (user_id, settings) values (?,?) ' 
                                                 + 'on conflict(user_id) do update set settings = excluded.settings');
const userSettingsSelect = userSettings.db.prepare('select * from user_settings where user_id = ?');

userSettings.set = (userId, userSettings) => userSettingsUpsert.run(userId, userSettings);
userSettings.get = (userId) => userSettingsSelect.get(userId);


module.exports = {
  users,
  userSettings,
  userStats,
  servers
}