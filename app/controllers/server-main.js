'use strict';

var mongoose = require('mongoose'),
    Group = mongoose.model('Group'),
    Player = mongoose.model('Player'),
    rest = require('../others/restware'),
    config = require('../../config/config'),
    fs = require('fs'),
    async = require('async'),
    path = require('path');

var socketio = require('./server-socket');

var playersToBeSynced = {}, players = {};

exports.getStatus = function (req, res) {
    return rest.sendSuccess(res, 'Dummy status', {server: true});
}

exports.getSettings = function () {
}

exports.saveSettings = function () {
}

exports.deploy = function (group, cb) {
    async.series([
        function (async_cb) {
            Player.find({'group._id': group._id}, function (err, data) {
                if (err) {
                    console.log("Unable to get Players list for deploy,", err);
                    async_cb(err);
                } else {
                    data.forEach(function (player) {
                        playersToBeSynced[player.cpuSerialNumber] = player;
                    });
                    players[group._id.toString()] = data;
                    async_cb()
                }
            })
        },
        function (async_cb) {
            var syncPath = path.join(config.syncDir,  group.name),
                mediaPath = path.join(config.mediaDir);
            async.eachSeries(group.assets,
                function (file, iterative_cb) {
                    fs.unlink(path.join(syncPath, file), function (err) {
                        fs.symlink(path.join(mediaPath, file), path.join(syncPath, file), function (err) {
                            if (err && (err.code != 'ENOENT')) {
                                iterative_cb(err);
                            } else {
                                iterative_cb();
                            }
                        })
                    })
                },
                function (err, result) {
                    async_cb(err);
                }
            )
        },
        function (async_cb) {
            var syncPath = path.join(config.syncDir, group.name);
            fs.readdir(syncPath, function (err, data) {
                if (err)
                    async_cb(err)
                else {
                    var files = data.filter(function (file) {
                        return (file.charAt(0) != '.');
                    })
                    async.eachSeries(files,
                        function (file, iterative_cb) {
                            if (group.assets.indexOf(file) == -1) {
                                fs.unlink(path.join(syncPath, file), function (err) {
                                    iterative_cb(err);
                                })
                            } else {
                                iterative_cb();
                            }
                        },
                        function (err, result) {
                            async_cb(err);
                        }
                    )
                }
            })

        }], function (err, results) {
            if (err) {
                console.log("Error in deploy: ", err);
                return cb(err, group);
            }
            players[group._id.toString()].forEach(function (player) {
                socketio.emitMessage(player.socket, 'sync', group.playlists, group.assets);
            });
            console.log("sending sync event to players");
            cb(null, group);
        }
    );
}
