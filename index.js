
let path = require("path");
let fs = require("fs");
let express = require("express");
let app = express();
let http = require('http').Server(app);
let request = require("request");
let io   = require("socket.io")(http, {
    pingInterval: 1000,
    pingTimeout: 2000,
});

let pauseable = require("pauseable");



const escapeHtml = function (text) {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
};

class EventEmitter {
	constructor() {
		this.listeners = {};
	}

	on(name, callback) {
		if (!Array.isArray(this.listeners[name])) {
			this.listeners[name] = [];
		}

		this.listeners[name].push(callback);
	}

	emit(name, ...args) {
		if (this.listeners[name] !== undefined) {
			this.listeners[name].forEach(listener => listener(...args));
		}
	}
}

class User {
    constructor(name, token) {
        this.name = name;
        this.token = token;
    }
}

class UserCollection {
    constructor() {
        this.users = [];
    }

    getPlain() {
        return this.users.map(user => ({ name: user.name }));
    }

    add(user) {
        this.users.push(user);
    }

    findByName(name) {
        return this.users.find(user => user.name === name);
    }   

    setProperty(property, username) {
        this.findByName(username)[property] = true;        
    }

    removePropertyFromEveryone(property) {
        this.users = this.users.map(user => {
            let {[property]: _, ...rest} = user;
            return rest;
        });
    }

    everyoneHas(property) {
        return this.users.reduce((result, user) => result && user[property], true);
    }

    waitForEveryone(socket, property, callback) {
        if (socket.name) {
            this.setProperty(property, socket.name);
            console.log(`${socket.name} is ${property}`);
            if (this.everyoneHas(property)) {
                callback();
                this.removePropertyFromEveryone(property);
            }
        }
    }

    remove(user) {
        let index = this.users.findIndex(_user => _user.name === user.name);
        this.users.splice(index, 1);
    }

    exists(user) {
        return this.users.findIndex(_user => _user.name === user.name) !== -1;
    }

    isEmpty() {
        return !this.users.length;
    }
}

class YoutubeVideo {
    constructor(id, title, length, thumb) {
        this.id         = id;
        this.title      = title;
        this.length     = length;
        this.timeString = this.buildTimeString(length);
        this.thumb      = thumb;
        this.timer      = null;
        this.currentPosition = 0;
        this.ended           = false;
        this.SERVER_TIMER_PERIOD_MS = 100;
    }   

    getPlain() {
        return {
            id        : this.id,
            title     : this.title,
            thumb     : this.thumb,
            length    : this.length,
            timeString: this.timeString,
            position  : this.currentPosition
        } 
    }

    reset() {
        this.currentPosition = 0;
        this.ended = false;
    }

    play() {
        if (!this.timer) {
            this.timer = pauseable.setInterval(() => {
                let scale = this.SERVER_TIMER_PERIOD_MS / 1000;
                if ((this.currentPosition += scale) < this.length) {
                    console.log(` Position: ${this.currentPosition}, String: ${this.buildTimeString(this.currentPosition)}`);
                } else {
                    this.ended = true;
                    this.timer.pause();
                }
            }, this.SERVER_TIMER_PERIOD_MS);
        } else if (this.timer.isPaused()) {
            if (this.ended) {
                this.reset();
            }

            this.timer.resume();
        }
    }

    pause() {
        if (this.timer) this.timer.pause();
    }

    _play() {

        //Ignore calls when video is already playing.
        if (this.intervalID) return;

        this.intervalID = setInterval(() => {
            if (this.currentPosition + 1 <= this.length) {
                this.currentPosition++;
                console.log(` Position: ${this.currentPosition}, String: ${this.buildTimeString(this.currentPosition)}`);
            } else {
                this.ended = true;
                this.clearInterval();
            }
        }, 1000);
    }

    _pause() {
        this.clearInterval();
    }

    setPosition(position) {
        this.currentPosition = position;
    }

    buildTimeString(seconds) {
        let hms = [
            String(parseInt(  seconds / 3600)),
            String(parseInt(( seconds % 3600)  / 60)),
            String(parseInt(((seconds % 3600)  % 60) % 60))
        ]
        .map(unit => unit.padStart(2, "0"));

        return `${parseInt(hms[0]) ? hms[0]+":" : ""}${hms[1]}:${hms[2]}`;
    }
}

class Playlist {
    constructor() {
        this.videos = [];
    }

    getVideos() {
        return this.videos;
    }

    getNext() {
        return this.videos.shift();
    }

    add(video) {
        this.videos.push(video);
    }

    remove(video) {
        this.videos = this.videos.filter(currentVideo => {
            return currentVideo.id !== video.id;
        });
    }

    isEmpty() {
        return !this.length;
    }

}

class Message {
    constructor(author, content) {
        this.author = author;
        this.content = content;
    }
}

class Chat {
    constructor() {
        this.messages = [];
    }
    
    addMessage(message) {
        this.messages.push(message);
    }

    getLatest(amount = 10) {
        return this.messages.slice(this.messages.length - amount);
    }
}

class History {
    constructor() {
        this.videos = [];
    }

    add(video) {
        this.videos.push(video);
    }

    get() {
        return this.videos;
    }

}

class WatchTogetherRoom extends EventEmitter {
    constructor(id, io, ytApi) {
        super();
        this.id       = id; 
        this.socket   = io.of("/" + id);
        this.ytApi    = ytApi;
        this.video    = null;
        this.users    = new UserCollection();
        this.playlist = new Playlist();
        this.history  = new History();
        this.chat     = new Chat();
        this.bindEvents();
    }

    log(message) {
        if (typeof message === "object") {
            console.log(`======== [${this.id}] ========`);            
            console.log(`=> ${message.label}`); 
            console.log(message.data);
            console.log(`======== END LOG OBJECT ========`);            
        } else {
            console.log(`[${this.id}] ${message}`);
        }
    }

    processEvent(handler, socket) {
        return data => {
            handler(socket, data);
        };
    }

    bindSocketEvent(socket, event, handler) {
        socket.on(event, this.processEvent(handler.bind(this), socket));
    }

    broadcast(event, data) {
        this.socket.emit(event, data);
    }

    onChatMessage(socket, msg) {
        let message = new Message(
            escapeHtml(msg.author),
            escapeHtml(msg.content)
        );

        //Set author chat color
        message.color = msg.color;

        this.chat.addMessage(message);
        this.broadcast("chat-message", message);
        this.log(`${message.author}: ${message.content}`);
    }

    onNewUser(socket, username) {
        let name = escapeHtml(username);
        let user = new User(name);
        
        this.log(`New User: ${name}`);

        if (!this.users.exists(user)) {
            this.log(`User ${name} doesnt exist`);
            //Save unique name on socket
            socket.name = name;
            this.users.add(user);
        } else {
            this.log(`User ${name} already exists`);    
            socket.emit("name-already-exists", name);
        }
        
        //Notify everyone of the new person 
        this.broadcast("users-update", this.users.getPlain());
        
        //Send latest state to the client, Note: chat is manually requested by client for now
        socket.emit("playlist-update", this.playlist.getVideos());
        socket.emit("history-update");

    }

    onPlayerVideoChange(socket, link) {
        this.ytApi.getVideo(link)
            .then(video => {
                //If we had another video, stop playing it
                if (this.video) this.video.pause();
                //Then overwrite reference to new video.
                this.video = video;
                this.broadcast("player-video-change", video.getPlain());
                this.log({label: `Changed video`, data: video});
            })
            .catch(error => {
                console.log(error);   
            });
    }

    onPlayerVideoReady(socket, link) {
        this.users.waitForEveryone(socket, "ready", () => {
            setTimeout(() => {
                this.video.play();
                this.broadcast("player-everyone-ready");
                this.log(`Everyone is ready. Emitting start`);
            }, 1000);
        });
    }

    onPlayerVideoEnded(socket) {
        if (!this.playlist.isEmpty()) {
            console.log(this.playlist);
            this.users.waitForEveryone(socket, "ended", () => {
                this.broadcast("player-video-change", this.playlist.getNext().getPlain());
            });
        }
    }

    onPlayerPause(socket, time) {
        this.log(`${socket.name} clicked pause.`);
        this.video.pause();
        this.video.setPosition(time);
        this.broadcast("player-pause", time);
    }

    onPlayerPlay(socket) {
        if (this.video) {
            this.video.play();
            this.broadcast("player-play");
        }
    }

    onPlayerReady(socket) {
        if (this.video) {
            this.log(`Sending current video to ${socket.name}`);
            socket.emit("current-video", this.video.getPlain());
        }
    }

    onPlayerVideoPositioning(socket, time) {
        this.broadcast("player-video-positioning", time);
        this.video.pause();
        this.video.setPosition(time);
    }

    onPlaylistNewVideo(socket, link) {
        this.ytApi.getVideo(link)
            .then(video => {
                this.playlist.add(video);
                this.broadcast("playlist-new-video", video.getPlain());
                this.log({label: "Added video to playlist", data: video});
            })
            .catch(error => {
                this.log(error);   
            });
    }

    onRequestPause(socket) {
        this.video.pause();
        this.broadcast("player-pause", this.video.currentPosition);
    }

    onRequestChatUpdate(socket) {
        socket.emit("chat-update", this.chat.getLatest());
    }

    onDisconnect(socket, name) {
        if (socket.name) {
            this.users.remove(this.users.findByName(socket.name));
            this.broadcast("users-update", this.users.getPlain());
            this.log(`Disconnected: ${socket.name}`);
            if (this.users.isEmpty()) {
                this.emit("w2groom-empty");
            }
        }
    }

    bindEvents() {
        this.socket.on("connection", socket => {
            this.log("New socket connected");
            this.bindSocketEvent(socket, "disconnect",   this.onDisconnect);
            this.bindSocketEvent(socket, "user-new",     this.onNewUser);
            this.bindSocketEvent(socket, "chat-message", this.onChatMessage);            
            this.bindSocketEvent(socket, "playlist-new-video", this.onPlaylistNewVideo);
            this.bindSocketEvent(socket, "player-video-change", this.onPlayerVideoChange);
            this.bindSocketEvent(socket, "player-video-ready", this.onPlayerVideoReady);
            this.bindSocketEvent(socket, "player-video-ended", this.onPlayerVideoEnded);
            this.bindSocketEvent(socket, "player-pause", this.onPlayerPause);
            this.bindSocketEvent(socket, "player-play",  this.onPlayerPlay);
            this.bindSocketEvent(socket, "player-video-positioning", this.onPlayerVideoPositioning);
            this.bindSocketEvent(socket, "player-ready", this.onPlayerReady);
            this.bindSocketEvent(socket, "request-pause", this.onRequestPause);
            this.bindSocketEvent(socket, "request-chat-update", this.onRequestChatUpdate);

        });
    }
}

class LobbyManager extends EventEmitter {

    constructor(io, ytApi) {
        super();
        this.socket = io.of("/lobby");
        this.ytApi  = ytApi;
        console.log("Hello new lobby manager");
        this.bindEvents();
    }

    createId() {
        let tokens = "0123456789abcdef";
        return new Array(8).fill(0).map(slot => {
            return tokens[Math.floor(Math.random() * tokens.length)];
        }).join("");
    }

    bindEvents() {
        
        this.socket.on("connection", socket => {
            console.log("Someone connected to lobby");
            socket.on("request-room", () => {
                console.log("Hello we wanter room");
                let id = this.createId();
                //Beware io is currently a global variable. Todo: make more obvious
                //Give each room a reference to the ytApi (still only one instance)
                this.emit("new-room", new WatchTogetherRoom(id, io, this.ytApi));
                socket.emit("room-accepted", {id: id});
            });
        });
    }
}


class YoutubeAPI {
    constructor(key) {
        this.baseUrl = "https://www.googleapis.com/youtube/v3/videos";
        this.key = key;
    }

    getId(link) {
        //Todo: Make proper regex, maybe take room.js one idk
        return link.split("watch?v=")[1].split("&list")[0].substr(0, 11);
    }

    convertISOToSeconds(ISOTimeString) {

        let matches = ISOTimeString.match(/PT(\d+H)?(\d+M)?(\d+S)?/i);
        let seconds = 0;

        if (matches !== null) {
            if (matches[1]) {
                seconds += 3600 * parseInt(matches[1].slice(0, -1));
            }
            if (matches[2]) {
                seconds += 60 * parseInt(matches[2].slice(0, -1));
            }
            if (matches[3]) {
                seconds += parseInt(matches[3].slice(0, -1));
            }
        }

        return seconds;
    }

    getVideo(link) {

        return new Promise((resolve, reject) => {
            let id = this.getId(link);
            let properties = {
                key: this.key,
                id: id,
                part: "snippet,contentDetails"
            };

            request({url: this.baseUrl, qs: properties}, (error, res, body) => {

              
                if (error) {
                    reject(error);
                    return;
                }

                let response = JSON.parse(body);
                if (response.pageInfo.totalResults === 0) {
                    reject("No results");
                    return;
                }

                let video, title, thumb, duration;

                video = response.items[0];
                title = video.snippet.title;
                thumb = video.snippet.thumbnails.high.url;
                duration = this.convertISOToSeconds(video.contentDetails.duration);
                
                resolve(new YoutubeVideo(id, title, duration, thumb));
            });

        });
    }
}


class WatchTogether {
    constructor(socketIO) {
        this.io = socketIO;
        this.rooms = [];
        this.ytApi = new YoutubeAPI("AIzaSyAh93tgIfcLie-rkURQa-fPIQUB2i9LkX4"); 
        this.lobbyManager = new LobbyManager(socketIO, this.ytApi);
        this.bindEvents();
    }

    roomExists(id) {
        return this.rooms.find(room => room.id === id) !== undefined;
    }

    removeRoom(room) {
        this.rooms.splice(this.rooms.findIndex(_room => _room.id === room.id), 1);
    }

    bindEvents() {
        let self = this;

        this.lobbyManager.on("new-room", room => {
            this.rooms.push(room)
            /*room.on("w2groom-empty", () => {
                this.removeRoom(room);
                console.log(`!! Room [${room.id}] destroyed. !!`);
            });*/
            console.log(this.rooms);
        });

        this.io.sockets.on("connection", socket => {
            console.log("new w2g connection");
            socket.on("join-room", id => {
                if (self.roomExists(id)) {
                    socket.emit("join-success", id);
                } else {
                    socket.emit("join-bad-id");
                }
            });
        });

    }
}

let w2g = new WatchTogether(io);



/**
 * Created by tyyr on 12.07.2018.
 */


app.use("/", express.static(__dirname + "/public"));
//app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res){
    res.sendFile(__dirname + "/views/index.html");
});

app.get('/room/:id', function(req, res){
    if (w2g.roomExists(req.params.id)) {
        res.sendFile(__dirname + "/views/room.html");
    } else {
        res.sendFile(__dirname + "/views/badroomid.html");
    }
});

const YTApi = {

    baseUrl: "https://www.googleapis.com/youtube/v3/videos",
    key: "AIzaSyAh93tgIfcLie-rkURQa-fPIQUB2i9LkX4",

    getId: function(link) {
        return link.split("watch?v=")[1].split("&list")[0].substr(0, 11);
    },

    convertISOToSeconds: function(ISOTimeString) {

        let matches = ISOTimeString.match(/PT(\d+H)?(\d+M)?(\d+S)?/i);
        let seconds = 0;

        if (matches !== null) {
            if (matches[1]) {
                seconds += 3600 * parseInt(matches[1].slice(0, -1));
            }
            if (matches[2]) {
                seconds += 60 * parseInt(matches[2].slice(0, -1));
            }
            if (matches[3]) {
                seconds += parseInt(matches[3].slice(0, -1));
            }
        }

        return seconds;
    },

    getMetadata: function(link, callback) {
        let self = this;
        let id = this.getId(link);

        let properties = {
            key: this.key,
            id: id,
            part: "snippet,contentDetails"
        };

        request({url: this.baseUrl, qs: properties}, function(error, res, body) {

            if (error) console.log(error);

            let response = JSON.parse(body).items[0];
            let video = {
                id: id,
                thumb: response.snippet.thumbnails.high.url,
                title: response.snippet.title,
                duration: self.convertISOToSeconds(response.contentDetails.duration)
            };

            callback(video);
        });

    },
};


const saveToHistoryFile = function(video) {
    fs.readFile(__dirname + "/localdb/history.json", "utf8", function(error, data) {
        if (error) {
            console.log(error);
        } else {
            let json;
            let history = JSON.parse(data);
            history.push(video);
            json = JSON.stringify(history, null, 4);
            fs.writeFile("localdb/history.json", json, "utf8", function() {});
            console.log("Saved to file.");
        }
    });
};

const loadHistory = function() {
    return JSON.parse(fs.readFileSync(__dirname + "/localdb/history.json", "utf8"));
};

const isValidLink = function(link) {
    return /watch\?v=[a-zA-Z0-9\_\-]{11}/i.test(link);
};

const verify = message => message.moderatedEvent === "1337";

let connections = [];
let users = [];
let intervalId = null;
let currentVideo = {
    id: null,
    duration: null,
    time: 0,
    authorativeState: null
};
let videoEndedCooldown = false;
let playlist = [];
let history = loadHistory();




io.sockets.on("connection", function(socket) {

   connections.push(socket);
   console.log("Connected: %s sockets connected.", connections.length);

   socket.emit('get-users', users);


   socket.on("disconnect", function() {
       if (socket.username) {
           users.splice(users.indexOf(socket.username), 1);
           updateUsernames();
       }
       connections.splice(connections.indexOf(socket), 1);
       console.log((socket.username ? (socket.username + " ") : "") + "Disconnected: %s sockets connected.", connections.length);
   });
                        
   socket.on("player-ready", function() {
       if (currentVideo.id !== null) {
           socket.emit("current-video", currentVideo);
       }
       if (playlist.length > 0) {
           socket.emit("get-playlist", playlist);
       }
       if (history.length > 0) {
           socket.emit("get-history", history.slice(history.length - 50, history.length));
       }
   });

   socket.on("playlist-new-video", function(message) {
       if (isValidLink(message.link)) {
           YTApi.getMetadata(message.link, function (video) {
               playlist.push(video);
               message = video;
               io.emit("playlist-new-video", message);
           });
       } else {
           socket.emit("invalid-link");
           console.log("Playlist: No valid video");
       }
   });

   socket.on("playlist-remove-video", function(message) {
       playlist.splice(playlist.map(video => video.id).indexOf(message.id), 1);
       io.emit("playlist-remove-video", message);
   });

   socket.on("video-ended", function(message) {

       clearInterval(intervalId);
       intervalId = null;

       if (playlist.length === 0) {
           return;
       }

       if (!videoEndedCooldown) {

           videoEndedCooldown = true;

           setTimeout(function() {
               videoEndedCooldown = false;
           }, 5000);

           let index = playlist.map(video => video.id).indexOf(currentVideo.id);

           if (currentVideo.id !== playlist[playlist.length - 1].id) {
               currentVideo = JSON.parse(JSON.stringify(playlist[index + 1]));

               if (history.length === 0 || history[history.length - 1].id !== currentVideo.id) {
                   let copy = JSON.parse(JSON.stringify(currentVideo));
                   history.push(copy);
                   saveToHistoryFile(copy);
                   io.emit("history-new-video", copy);
               }

               currentVideo.time = 0;
               currentVideo.authorativeState = "playing";

               console.log("Playlist: Changing to " + currentVideo.title);

               setTimeout(function() {

                   if (intervalId === null) {
                       intervalId = setInterval(function() {
                           currentVideo.time++;
                       }, 1000);
                   }

                   io.emit("chat-message", {
                       author: "Server",
                       content: "Started next video in playlist."
                   });
                   io.emit("video-change", currentVideo);
               }, 2000);
           }

           if (index >= 0) {
               io.emit("playlist-remove-video", {id: playlist[index].id});
               playlist.splice(index, 1);
           }

       }

   });

    socket.on("video-change", function(message) {
        
        if (isModeratedMode && !verify(message)) {
            socket.emit("moderated");
            return;
        }
       

        if (isValidLink(message.link)) {

            YTApi.getMetadata(message.link, function(video) {

                if (history.length === 0 || history[history.length - 1].id !== video.id) {
                    history.push(video);
                    saveToHistoryFile(video);
                    io.emit("history-new-video", video);
                }

                currentVideo = JSON.parse(JSON.stringify(video));
                currentVideo.time = 0;
                currentVideo.authorativeState = "playing";


                if (intervalId === null) {
                    intervalId = setInterval(function() {
                        currentVideo.time++;
                    }, 1000);
                }

                io.emit("chat-message", {
                    author: "Server",
                    content: (socket.username ? socket.username : "Multi Tab Noob") + " has changed the video."
                });
                io.emit("video-change", currentVideo);
            });

        } else {
            socket.emit("invalid-link");
            console.log("No valid video");
        }
    });

    socket.on("video-start", function(message) {
        
        if (isModeratedMode && !verify(message)) {
            socket.emit("moderated");
            return;
        }

        message = message || {};
        currentVideo.authorativeState = "playing";
        message.authorativeState = "playing";


        io.emit("video-start", message);
        if (intervalId === null) {
            intervalId = setInterval(function() {
                currentVideo.time++;
            }, 1000);
        }
    });

    socket.on("video-pause", function(message) {
        
        if (isModeratedMode && !verify(message)) {
            socket.emit("moderated");
            return;
        }
        
        message = message || {};
        currentVideo.authorativeState = "paused";
        message.authorativeState = "paused";

        clearInterval(intervalId);
        intervalId = null;
        io.emit("video-pause", message);
    });

    socket.on("video-positioning", function(message) {
        if (isModeratedMode && !verify(message)) {
            socket.emit("moderated");
            return;
        }
        io.emit("video-positioning", message);
        currentVideo.time = message.time;
    });

    socket.on("new-user", function(message) {
        if (users.indexOf(message.name) === -1) {
            console.log("Adding " + message.name + " to users");
            socket.username = escapeHtml(message.name);
            users.push(socket.username);
        }
        updateUsernames();
    });

    socket.on("chat-message", function(message) {
        message.author = escapeHtml(message.author);
        message.content = escapeHtml(message.content);
        io.emit("chat-message", message);
    });

    function updateUsernames() {
        io.sockets.emit('get-users', users);
    }

});

http.listen(51911, function(){
    console.log('Listening on 127.0.0.1:51911');
});
