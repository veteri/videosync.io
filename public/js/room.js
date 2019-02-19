class HTMLTemplate {
    constructor(template) {
        this.template = template; 
    }
    
    render(data) {
        return this.template.replace(/{{(.*?)}}/gi, (match, key) => data[key]);
    }
}

class UserDisplay {
    constructor(socket, options) {

        if (!socket) console.warn("UserDisplay needs a functional socket.io instance.");
        
        this.socket       = socket;
        this.username     = options.username;
        this.container    = document.querySelector(options.selector); 
        this.userTemplate = new HTMLTemplate(
            `<div class="user clearfix" data-user="{{name}}">
                 <img class="avatar" src="/images/user.png" alt="">
                 <div class="name">{{name}}</div>
             </div>`
        );

        this.bindEvents();
    }

    buildHtml(users) {
        return users.reduce((html, user) => html + this.userTemplate.render(user), "");
    }

    resetContainer() {
        this.container.innerHTML = "";
    }

    fillContainer(html) {
        this.container.innerHTML = html;
    }

    bindEvents()  {
        this.socket.on("users-update", users => {
            this.resetContainer();
            this.fillContainer(this.buildHtml(users));
        });
    }
}

class Chat {
    constructor(socket, options) {
        
        if (!socket) console.warn("Chat needs a functional socket.io instance.");

        this.socket     = socket;
        this.username   = options.username;
        this.container  = options.container;
        this.chatBox    = options.chatBox;
        this.emoteBox   = options.emoteBox;
        this.showEmotes = options.showEmotes;
        this.emotes     = {};
        this.emotePaths = {};

        this.emoteTemplate   = new HTMLTemplate(
            `<img title="{{key}}" src="{{path}}" width="50">`
        );

        this.messageTemplate = new HTMLTemplate(
            `<div class="message clearfix {{author}}">
                <div class="author">{{author}}:</div>
                <div class="content">{{content}}</div>
            </div>`
        );

        this.bindEvents();
    }

    getMessage() {
        let message;
        message = this.chatBox.value.replace(/\n*$/gi, "");
        message = message.replace(/^\s*$/gi, "");
        return message;
    }

    addMessage(message) {
        this.container.innerHTML += this.messageTemplate.render(message);
    }

    setMessageHtml(html) {
        console.log("setting html in chat to " + html);
        this.container.innerHTML = html;
    }

    buildMessageHtml(messages) {
        return messages.reduce((html, message) => {
            console.log(message);
            let emotedMsg = this.wrapEmotes(message);
            console.log(emotedMsg);
            return html + this.messageTemplate.render(this.wrapEmotes(message));
        }, ""); 
    }

    scrollDown() {
        this.container.scrollTop = this.container.scrollHeight;
    }
    
    wrapEmotes(message) {

        var expression, regex, replacement, link, self = this;
        Object.keys(this.emotes).forEach(emote => {

            expression = "[\\t \\n]" + emote + "(?!\\w)|^" + emote + "(?!\\w)";
            regex = new RegExp(expression, 'i');

            if (regex.test(message.content)) {
                regex = new RegExp(expression, 'gi');
                link = this.emotePaths[this.emotes[emote].type + "Path"] + this.emotes[emote].image;
                replacement = this.emoteTemplate.render({key: emote, path: link}); 
                message.content = message.content.replace(regex, replacement);
            }
        });
       
        return message;
    }
    
    loadEmotes(callback) {
        let self = this;
        var xhr = new XMLHttpRequest();

        xhr.addEventListener("load", function () {
            var response = JSON.parse(this.responseText);
            self.emotes = response.emotes;
            self.emotePaths = response.settings;
            
            if (typeof callback === "function") {
                 callback();
            }
           
        });

        xhr.open('GET', '/emotes/emotes.json', true);
        xhr.send();
    }

    setEmoteHtml(html) {
        this.emoteBox.innerHTML = html;
    }

    buildEmoteHtml() {
        let emote, path;
        return Object.keys(this.emotes).reduce((html, emoteKey) => {
            emote = this.emotes[emoteKey];
            path = this.emotePaths[`${emote.type}Path`] + emote.image;
            return html + this.emoteTemplate.render({
                key: emoteKey,
                path: path
            });
        }, "");
    }

    bindEvents() {

        let self = this;
        
        //Load emotes and build emoteBox Html
        this.loadEmotes(() => { this.setEmoteHtml(this.buildEmoteHtml()); });

        this.showEmotes.addEventListener("click", event => {
            $(this.emoteBox).fadeToggle();
        });

        this.emoteBox.addEventListener("click", event => {
            if (event.target.tagName === "IMG") {
                this.chatBox.value += event.target.title + " ";
                this.chatBox.focus();
            }
        });

        this.chatBox.addEventListener("keydown", event => {
            //Todo: Shift+Enter should add new line and not send message.
            if (event.keyCode === 13) event.preventDefault();
        });

        this.chatBox.addEventListener("keyup", event => {
            if (event.keyCode === 13 && this.getMessage().length > 0) {
                //Dont add the linefeed itself to chat
                event.preventDefault();

                this.socket.emit("chat-message", {
                    author: this.username,
                    content: this.chatBox.value
                });

                this.chatBox.value = "";
                $(this.emoteBox).fadeOut();
            }
        });

        this.socket.on("chat-message", message => {
            if (document.hidden) {
                new Audio("/audio/chat_noti.mp3").play();
            }
            this.addMessage(this.wrapEmotes(message));
        });

        this.socket.on("chat-update", messages => {
            console.log(messages);
            this.setMessageHtml(this.buildMessageHtml(messages));
        });
    }
}


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

class VideoLinkInput extends EventEmitter {
    constructor(options) {
        super();
        this.input         = options.input;
        this.playVideo     = options.playVideo;
        this.addToPlaylist = options.addToPlaylist;
        this.bindEvents();
    }

    showError() {
        this.input.classList.add("error");
    }

    removeError() {
        this.input.classList.remove("error");
    }

    isYoutubeLink(link) {
        console.log("checking link " + link);
        return /https?:\/\/(www\.)?youtube\.com\/watch\?.*v=([_-a-zA-Z0-9]+).*/gi.test(link);
    }

    bindEvents() {

        let self = this;

        this.input.addEventListener("click", function() {
            self.removeError();
            this.setSelectionRange(0, this.value.length);
        });

        this.input.addEventListener("keyup", event => {
            if (event.keyCode === 13 && this.isYoutubeLink(this.input.value)) {
                console.log("VideoLinkInput: Emitting video-play with " + this.input.value);
                this.emit("video-play", this.input.value);
                this.removeError();
            }
        });

        this.playVideo.addEventListener("click", event => {
            if (this.isYoutubeLink(this.input.value)) {
                console.log("VideoLinkInput: Emitting video-play with " + this.input.value);
                this.emit("video-play", this.input.value);
                this.removeError();
            }
        });

        this.addToPlaylist.addEventListener("click", event => {
            if (this.isYoutubeLink(this.input.value)) {
                console.log("VideoLinkInput: Emitting playlist-add with " + this.input.value);
                this.emit("playlist-add", this.input.value);
                this.socket
                this.removeError();
            }
        });
    }
};


 class Playlist extends EventEmitter {
    constructor(socket, options) {
        super();
        this.socket = socket;
        this.list   = options.list
        
        this.videoTemplate = new HTMLTemplate(
            `<div class="video clearfix" data-id="{{id}}">
                <div class="thumb">
                    <img src="{{thumb}}" alt="Thumb">
                    <span class="length">{{timeString}}</span>
                </div>
                <div class="title">{{title}}</div>
                <div class="remove"><i class="fas fa-trash-alt"></i></div>
            </div>`
        );

        this.bindEvents();
    }

    add(video) {
        this.list.innerHTML += this.videoTemplate.render(video);
    }

    remove(id) {
        let video = this.list.querySelector(`.video[data-id="${id}"`);
        this.list.removeChild(video);
    }

    setHtml(html) {
        this.list.innerHTML = html;
    }

    buildHtml(videos) {
        return videos.reduce((html, video) => html + this.videoTemplate.render(video), "");
    }
    
    videoExists(id) {
        return this.list.querySelector(`[data-id="${id}"`) !== null;
    }

    emitNewVideo(link) {
        this.socket.emit("playlist-new-video", link);
    }

    bindEvents() {

        this.socket.on("playlist-new-video",    video => this.add(video));
        this.socket.on("playlist-remove-video", video => this.remove(video));
        this.socket.on("playlist-update", videos => {
            this.setHtml(this.buildHtml(videos));
        });

        this.list.addEventListener("click", event => {

            let video = event.target.closest(".video");
            if (video === null) {
                return;
            }

            let id = video.getAttribute("data-id");
            if(event.target.parentElement.classList.contains("remove")) {
                
                this.socket.emit("playlist-remove-video", { id: id });

            }   else if (event.target.classList.contains("title") 
                        || event.target.parentElement.classList.contains("thumb")) {

                this.emit("video-play", id);
            }
        });
    }
}

class W2GYoutubePlayer {
    constructor(socket, id) {
        this.socket = socket;
        this.id     = id;
        this.player = null;
        this.bindEvents();
        this.loadIFrameAPI();
    }

    loadIFrameAPI() {
        let tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        let firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = function() {
            document.dispatchEvent(new CustomEvent('onYouTubeIframeAPIReady', {}))
        };
    }

    onPlayerReady() {
        console.log("onPlayerReady Todo");
    }

    onPlayerStateChange() {
        console.log("onPlayerStateChange Todo");
    }

    createPlayer() {
        this.player = new YT.Player(this.id, {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                autoplay: 0,
                controls: 0,
                fs      : 1
            },
            events: {
                'onReady': this.onPlayerReady,
                'onStateChange': this.onPlayerStateChange
            }
        });
        console.info("W2GYoutubePlayer ready.");
    }

    getId(link) {
        //Todo: Make proper regex, maybe take room.js one idk
        return link.split("watch?v=")[1].split("&list")[0].substr(0, 11);
    }

    loadVideo(id) {
        console.log("Loading video with id: " + id);
        this.player.loadVideoById(id);
    }

    emitVideoChange(link) {
        this.socket.emit("player-video-change", link);
        console.log("Emitting player-video-change");
    }

    bindEvents() {
        document.addEventListener('onYouTubeIframeAPIReady', () => this.createPlayer(), false);
        this.socket.on("player-video-change", video => this.loadVideo(video.id));
    }
}


const clientRoom = {

    socket: io({transports: ["websocket"]}),
    
    connectToRoom() {
        return new Promise((resolve, reject) => {
            
            let id = window.location.href.split("/").slice(-1)[0];
            console.log(`Connecting to room ${id}`);

            this.socket.emit("join-room", id); 
            this.socket.on("join-success", id => {
                this.socket = io("/" + id);
                console.log(`Connected to room ${id}`);
                resolve();
            });
            this.socket.on("join-bad-id", () => reject("Lobby does not exist"));

        });
    }, 

    promptName() {
        if (!localStorage.getItem("watch20iq_chatAlias")) {
            let name = prompt("Please enter your chat alias:", "");
            if (name === null) {
                name = "guest" + Math.floor(Math.random() * 9999);
            }
            localStorage.setItem("watch20iq_chatAlias", name);
        }
    },

    bindEvents() {
        console.log("Emitting user-new with name " + this.userDisplay.username);
        this.socket.emit("user-new", this.userDisplay.username);

        this.socket.on("disconnect", () => console.log("Disconnected..."));
        this.socket.on("reconnect", () => {
            console.log("Reconnected.");
            this.socket.emit("user-new", this.userDisplay.username);
        });

        //Link link-input to player and playlist
        this.videoLinkInput.on("video-play",   link => {
            console.log("Forwarding play-video to player");
            this.player.emitVideoChange(link)
        });
        this.videoLinkInput.on("playlist-add", link => this.playlist.emitNewVideo(link));
    },

    init() {
        this.connectToRoom()
            .then(() => {
                this.promptName(); 
                this.userDisplay = new UserDisplay(this.socket, {
                    username : localStorage.getItem("watch20iq_chatAlias"),
                    selector : ".online-users"
                });

                this.chat = new Chat(this.socket, {
                    username  : localStorage.getItem("watch20iq_chatAlias"),
                    container : document.querySelector(".chat .messages"),
                    chatBox   : document.querySelector(".chat textarea.content"),
                    emoteBox  : document.querySelector(".chat .emotes"),
                    showEmotes: document.querySelector(".chat .show-emotes")
                });

                this.videoLinkInput = new VideoLinkInput({
                    input        : document.querySelector(".yt-link"),
                    playVideo    : document.querySelector(".search > .play"),
                    addToPlaylist: document.querySelector(".search > .add-playlist"),
                });

                this.playlist = new Playlist(this.socket, {
                    list: document.querySelector(".playlist > .body")
                });

                this.player = new W2GYoutubePlayer(this.socket, "player");

                this.bindEvents(); 
            })
            .catch(error => {
                console.log(error);   
            });

    }
};

clientRoom.init();
