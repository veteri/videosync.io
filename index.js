
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

let isModeratedMode = true;

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

class YoutubeVideo {
    constructor(id, title, length) {
        this.id = id;
        this.title = title;
        this.length = length;
    }   

}

class Playlist {
    constructor() {
        this.videos = [];
    }

    add(video) {
        this.videos.push(video);
    }

    remove(video) {
        this.videos.filter(currentVideo => currentVideo.id !== video.id);
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
    constructor(id, io) {
        super();
        this.id = id; 
        this.socket = io.of("/" + id);
        this.video = null;
        this.users = [];
        this.playlist = new Playlist();
        this.history = new History();
        this.chat = new Chat();
        this.bindEvents();
    }

    processEvent(handler, socket) {
        return data => {
            handler(socket, data);
        };
    }

    bindEvent(socket, event, handler) {
        socket.on(event, this.processEvent(handler, socket));
    }

    onVideoPause(socket, data) {
        socket.emit("ok");
        console.log("sending ok");
    }

    bindEvents() {
        this.socket.on("connection", socket => {
            console.log("Someone connected to room " + this.id);
            this.bindEvent(socket, "video-pause", this.onVideoPause);
        });
    }
}

class LobbyManager extends EventEmitter {

    constructor(io) {
        super();
        this.socket = io.of("/lobby");
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
        let self = this;
        
        this.socket.on("connection", function(socket) {
            console.log("Someone connected to lobby");
            socket.on("request-room", function() {
                console.log("Hello we wanter room");
                let id = self.createId();
                self.emit("new-room", new WatchTogetherRoom(id, io));
                socket.emit("room-accepted", {id: id});
            });
        });
    }
}

class WatchTogether {
    constructor(socketIO) {
        this.io = socketIO;
        this.rooms = [];
        this.lobbyManager = new LobbyManager(socketIO);
        this.bindEvents();
    }

    roomExists(id) {
        return this.rooms.find(room => room.id === id) !== undefined;

    }

    bindEvents() {
        let self = this;

        this.lobbyManager.on("new-room", room => {
            this.rooms.push(room)
            console.log(this.rooms);
        });

        this.io.sockets.on("connection", socket => {
            console.log("new w2g connection");
            socket.on("join-room", id => {
                if (self.roomExists(id)) {
                    socket.emit("join-success", id);
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
    //id = req.params.id
    res.sendFile(__dirname + "/views/room.html");
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
