/**
 * Created by tyyr on 12.07.2018.
 */

const watch20iq = (function() {

    let socket;
    let moderatedEvent = localStorage.getItem("9d87233bdc98770b73a1378f6e36855f");

    let headerControl = {
        linkInput: document.querySelector(".yt-link"),
        openVideo: document.querySelector(".search > .play"),
        addToPlaylist: document.querySelector(".search > .add-playlist"),

        showError: function() {
            this.linkInput.classList.add("error");
        },

        removeError: function() {
            this.linkInput.classList.remove("error");
        },

        bindEvents: function() {

            let self = this;

            self.linkInput.addEventListener("click", function() {
                self.removeError();
                this.setSelectionRange(0, this.value.length);
            });

            self.linkInput.addEventListener("keyup", function(event) {
                if (event.keyCode === 13) {
                    player.emitVideoChange(this.value);
                    self.removeError();
                }
            });

            self.openVideo.addEventListener("click", function(event) {
                player.emitVideoChange(self.linkInput.value);
                self.removeError();
            });

            self.addToPlaylist.addEventListener("click", function(event) {
                if (!playlist.videoExists(player.getId(self.linkInput.value))) {
                    socket.emit("playlist-new-video", {link: self.linkInput.value});
                    self.removeError();
                }
            });

            socket.on("invalid-link", function() {
                self.showError();
            });
        }
    };

    let users = {
        container: document.querySelector(".online-users"),
        add: function(name) {
            this.container.innerHTML += `
                <div class="user clearfix" data-user="${name.replace(/\s*/gi, "")}">
                    <img class="avatar" src="/images/user.png" alt="">
                    <div class="name">${name}</div>
                </div>
            `;
        },

        bindEvents: function() {
            let self = this;
            socket.on("get-users", function(message) {
                self.container.innerHTML = "";
                message.forEach(function(user) {
                    self.add(user);
                });
            });
        }
    };

    let player = {

        _player: null,
        _playerElement: null,
        authorativeState: null,


        getId: function(link) {
            return link.split("watch?v=")[1].split("&list")[0].substr(0, 11);
        },

        loadVideo: function(id) {
            this._player.cueVideoById({
                videoId: id,
                startSeconds: 0,
            });
        },

        changePosition: function(time) {
            console.log("Skipping to " + time);
            this._player.seekTo(time, true);
        },

        changeVolume: function(volume) {
            this._player.setVolume(volume);
        },

        getTime: function() {
            return this._player.getCurrentTime();
        },

        pause: function() {
            this._player.pauseVideo();
        },

        start: function() {
            this._player.playVideo();
        },

        emitVideoChange: function(link) {
            socket.emit("video-change", { link, moderatedEvent });
        },

        onPlayerReady: function() {
            console.log("player is ready");
            document.dispatchEvent(new CustomEvent("playerReady"), {});
            socket.emit("player-ready");
            player.changeVolume(localStorage.getItem("watch20iq_playerVolume"));
        },

        onPlayerStateChange: function(event) {

            if (event.data === YT.PlayerState.PAUSED) {
                if (player.authorativeState === "playing") {
                    console.log("Force start.");
                    player.start();
                }
            }
            if (event.data === YT.PlayerState.PLAYING) {
                if (player.authorativeState === "paused") {
                    console.log("Force pause.");
                    player.pause();
                }
            }

            if (event.data === YT.PlayerState.ENDED) {
                console.log("Video ended");
                socket.emit("video-ended");
            }
        },

        bindEvents: function() {

            let self = this;

            document.addEventListener('onYouTubeIframeAPIReady', function (e) {
                self._player = new YT.Player('player', {
                    height: '360',
                    width: '640',
                    videoId: '',
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                    },
                    events: {
                        'onReady': self.onPlayerReady,
                        'onStateChange': self.onPlayerStateChange
                    }
                });

                self._playerElement = document.querySelector("#player");

            }, false);

            socket.on("current-video", function(message) {
                document.title = "[W2G] " + message.title;
                videoControl.videoLength = message.duration;
                self.authorativeState = message.authorativeState;

                console.log("Playerstate before load: " + player._player.getPlayerState());
                self.loadVideo(message.id);
                setTimeout(function() {
                    self.changePosition(message.time + 1);
                }, 1000);

                if (message.authorativeState === "playing") {
                    videoControl.setPlayIcon("pause");
                }
                self.start();
            });

            socket.on("video-change", function(message) {
                document.title = "[W2G] " + message.title;
                videoControl.videoLength = message.duration;
                self.authorativeState = message.authorativeState;

                videoControl.setPlayIcon("pause");
                self.loadVideo(message.id);
                self.start();

            });

            socket.on("video-start", function(message) {
                self.authorativeState = message.authorativeState;
                videoControl.setPlayIcon("pause");
                self.start();
            });

            socket.on("video-pause", function(message) {
                self.authorativeState = message.authorativeState;
                videoControl.setPlayIcon("play");
                self.pause();
            });

            socket.on("video-positioning", function(message) {
                self.changePosition(message.time);
            });
        },

        init: function() {

            this.bindEvents();

            let tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            let firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

            window.onYouTubeIframeAPIReady = function() {
                document.dispatchEvent(new CustomEvent('onYouTubeIframeAPIReady', {}))
            };

        }
    };


    let videoControl = {

        videoLength : 0,
        slider      : document.querySelector("#slider"),
        play        : document.querySelector(".play button"),
        playIcon    : document.querySelector(".play button i"),
        volumeSlider: document.querySelector(".volume input"),
        currentTime : document.querySelector(".time > .current"),
        maxTime     : document.querySelector(".time > .length"),

        updateTimer: function() {
            if (this.videoLength === 0) return;
            this.currentTime.textContent = this.getTimeString(player.getTime());
            this.maxTime.textContent = this.getTimeString(this.videoLength);
        },

        updateSlider: function() {
            if (this.videoLength === 0) return;
            this.slider.value = (player.getTime() / this.videoLength) * 200;
            this.currentTime.textContent = this.getTimeString(player.getTime());
        },

        getTimeString: function(time) {

            let hours = String(parseInt(time / 3600)).padStart(2, "0");
            let minutes = String(parseInt((time % 3600)  / 60)).padStart(2, "0");
            let seconds = String(parseInt(((time % 3600) % 60) % 60)).padStart(2, "0");

            return  `${parseInt(hours) ? hours+":" : ""}${minutes}:${seconds}`;
        },

        setPlayIcon: function(state) {
            switch (state) {
                case "play":
                    this.playIcon.classList.remove("ion-md-pause");
                    this.playIcon.classList.add("ion-md-play");
                    break;

                case "pause":
                    this.playIcon.classList.remove("ion-md-play");
                    this.playIcon.classList.add("ion-md-pause");
                    break;
            }
        },

        init: function () {

            let self = this;

            this.slider.value = 0;

            document.addEventListener("playerReady", function () {

                self.slider.addEventListener("change", function (event) {
                    console.log("New slider value: " + self.slider.value);
                    let time = self.videoLength * (self.slider.value / 200);
                    console.log("Skipped to " + time + "s");
                    socket.emit("video-positioning", {
                        time: time, 
                        moderatedEvent: moderatedEvent
                    });
                });

                self.volumeSlider.addEventListener("input", function(event) {
                    player.changeVolume(this.value);
                    localStorage.setItem("watch20iq_playerVolume", this.value);
                });

                console.log("starting timer");
                setInterval(function() {
                    self.updateTimer();
                    self.updateSlider();
                }, 250);
            });


            this.play.addEventListener("click", function() {

                if (player.authorativeState === null) {
                    return;
                }

                if (player.authorativeState === "playing") {
                    console.log("video paused");
                    self.setPlayIcon("play");
                    socket.emit("video-pause", {moderatedEvent: moderatedEvent});
                } else {
                    console.log("video started");
                    self.setPlayIcon("pause");
                    socket.emit("video-start", {moderatedEvent: moderatedEvent});
                }
            });
        }
    };

    let chat = {

        userAlias: null,
        container: document.querySelector(".chat .messages"),
        chatBox: document.querySelector("textarea.content"),
        showEmotes: document.querySelector(".chat .show-emotes"),
        emoteBox: document.querySelector(".chat .emotes"),
        emotes: {},
        emotePaths: {},

        getMessage: function() {
            let message;
            message = this.chatBox.value.replace(/\n*$/gi, "");
            message = message.replace(/^\s*$/gi, "");
            return message;
        },

        addMessage: function(message) {
            this.container.innerHTML += `
                <div class="message clearfix ${message.author === 'Server' ? 'system' : ''}">
                    <div class="author">${message.author}:</div>
                    <div class="content">${message.content}</div>
                </div>
            `;
            this.container.scrollTop = this.container.scrollHeight;
        },
        
        wrapEmotes: function (message) {

            var expression, regex, replacement, self = this;
    
            Object.keys(self.emotes).forEach(function (emote) {

                expression = "[\\t \\n]" + emote + "(?!\\w)|^" + emote + "(?!\\w)";
                regex = new RegExp(expression, 'i');

                if (regex.test(message.content)) {

                    regex = new RegExp(expression, 'gi');
                    link = self.emotePaths[self.emotes[emote].type + "Path"] + self.emotes[emote].image;
                    replacement = " <img class=\"emote\" src=\"" + link + "\" title=\"" + emote + "\"> ";
                    message.content = message.content.replace(regex, replacement);

                }
            });
           
    
            return message;

        },
        
        loadEmotes: function (callback) {
            let self = this;
            var xhr = new XMLHttpRequest();
    
            xhr.addEventListener("load", function () {
                    var response = JSON.parse(this.responseText);
                    self.emotes = response.emotes;
                    self.emotePaths = response.settings;
                    console.log(response);
                
                if (typeof callback === "function") {
                     callback();
                }
               
            });
    
            xhr.open('GET', '/emotes/emotes.json', true);
            xhr.send();
        },

        bindEvents: function() {

            let self = this;

            self.loadEmotes(() => {
                let emote, path;
                self.emoteBox.innerHTML = Object.keys(self.emotes).reduce((html, emoteKey) => {
                    emote = self.emotes[emoteKey];
                    path = self.emotePaths[`${emote.type}Path`] + emote.image;
                    return html + `
                        <img title="${emoteKey}" src="${path}" width="50">
                    `;
                }, "");
            });

            self.showEmotes.addEventListener("click", event => {
                $(self.emoteBox).fadeToggle();
            });

            self.emoteBox.addEventListener("click", event => {
				if (event.target.tagName === "IMG") {
                    self.chatBox.value += event.target.title + " ";
                    self.chatBox.focus();
				}
            });

            self.chatBox.addEventListener("keyup", function(event) {
                if (event.keyCode === 13 && self.getMessage().length > 0) {
                    socket.emit("chat-message", {
                        author: self.userAlias,
                        content: this.value
                    });
                    this.value = "";
                    $(self.emoteBox).fadeOut();
                }
            });

            socket.on("chat-message", function(message) {
                self.addMessage(
                    self.wrapEmotes(message)
                );
                if (document.hidden) {
                    new Audio("/audio/chat_noti.mp3").play();
                }
            });
        }
    };

    let playlist = {

        list: document.querySelector(".playlist > .body"),

        add: function(video) {
            this.list.innerHTML += `
                <div class="video clearfix" data-id="${video.id}">
                        <div class="thumb">
                            <img src="${video.thumb}" alt="Thumb">
                            <span class="duration">${videoControl.getTimeString(video.duration)}</span>
                        </div>
                        <div class="title">${video.title}</div>
                        <div class="remove"><i class="fas fa-trash-alt"></i></div>
                    </div>
            `;
        },

        remove: function(id) {
            let video = this.list.querySelector(`.video[data-id="${id}"`);
            console.log(id);
            this.list.removeChild(video);
        },

        videoExists: function(id) {
            return this.list.querySelector(`[data-id="${id}"`);
        },

        bindEvents: function() {
            let self = this;

            socket.on('playlist-new-video', function(message) {
                self.add(message);
            });

            socket.on("playlist-remove-video", function(message) {
                self.remove(message.id);
            });

            socket.on("get-playlist", function(message) {
               message.forEach(video => self.add(video));
            });

            this.list.addEventListener("click", function(event) {

                let video = event.target.closest(".video");

                if (video === null) {
                    return;
                }

                let id = video.getAttribute("data-id");

                if(event.target.parentElement.classList.contains("remove")) {
                    socket.emit("playlist-remove-video", { id: id });
                }   else if (event.target.classList.contains("title") || event.target.parentElement.classList.contains("thumb")) {
                    player.emitVideoChange("https://www.youtube.com/watch?v=" + id);
                }
            });
        }
    };

    let history = {

        list: document.querySelector(".history .body"),

        add: function(video) {
            this.list.innerHTML = `
                <div class="video clearfix" data-id="${video.id}">
                        <div class="thumb">
                            <img src="${video.thumb}" alt="Thumb">
                            <span class="duration">${videoControl.getTimeString(video.duration)}</span>
                        </div>
                        <div class="title">${video.title}</div>
                        <div class="add-to-playlist">
                            <i class="fas fa-list-ul"></i>
                        </div>
                    </div>
            ` + this.list.innerHTML;
        },

        bindEvents: function() {
            let self = this;

            socket.on("history-new-video", function(message) {
                self.add(message);
            });

            socket.on("get-history", function(message) {
                message.forEach(video => self.add(video));
            });

            this.list.addEventListener("click", function(event) {

                if (event.target.classList.contains("body")) {
                    return false;
                }

                let id = event.target.closest(".video").getAttribute("data-id");

                if (event.target.classList.contains("title") || event.target.parentElement.classList.contains("thumb")) {

                    player.emitVideoChange("https://www.youtube.com/watch?v=" + id);

                } else if (event.target.parentElement.classList.contains("add-to-playlist")) {

                    if (!playlist.videoExists(id)) {
                        socket.emit("playlist-new-video", {link: "https://www.youtube.com/watch?v=" + id});
                    }
                }
            });
        }
    };


    function init() {

        if (!localStorage.getItem("watch20iq_chatAlias")) {
            let name = prompt("Please enter your chat alias:", "");
            if (name === null) {
                name = "guest" + Math.floor(Math.random() * 9999);
            }
            localStorage.setItem("watch20iq_chatAlias", name);
        }

        chat.userAlias = localStorage.getItem("watch20iq_chatAlias");
        socket = io({transports: ["polling"]}); // pass {transports: ['websocket']}

        headerControl.bindEvents();
        player.init();
        videoControl.init();
        chat.bindEvents();
        users.bindEvents();
        playlist.bindEvents();
        history.bindEvents();

        setTimeout(function() {
            socket.emit("new-user", {
                name: chat.userAlias
            });
        }, 3000);

        socket.on("disconnect", function() {
            console.log("Lost connection...");
        });
        
        socket.on("moderated", function() {
            iziToast.error({
                title: 'Error',
                message: 'Site is in moderator mode (Drizzjeh)',
                 position: 'topRight',
            });
        });

        socket.on("reconnect", function() {
            console.log("Reconnected...");
            socket.emit("new-user", {
                name: chat.userAlias
            });
        });

    }

    return {
        init: init,
        player: player,
        playlist: playlist
    }

})();


watch20iq.init();
