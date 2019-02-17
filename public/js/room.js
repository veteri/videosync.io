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
        this.socket.on("update-users", users => {
            this.resetContainer();
            this.fillContainer(this.buildHtml(users));
        });
    }

    init() {
        this.bindEvents();
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
    }

    getMessage() {
        let message;
        message = this.chatBox.value.replace(/\n*$/gi, "");
        message = message.replace(/^\s*$/gi, "");
        return message;
    }

    addMessage(message) {
        this.container.innerHTML += this.messageTemplate.render(message);
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

        this.socket.on("update-chat", messages => {
            messages.forEach(message => {
                this.addMessage(this.wrapEmotes(message));
            });
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
                console.log("VideoLinkInput: Emitting play-video with " + this.input.value);
                this.emit("play-video", this.input.value);
                this.removeError();
            }
        });

        this.playVideo.addEventListener("click", event => {
            if (this.isYoutubeLink(this.input.value)) {
                console.log("VideoLinkInput: Emitting play-video with " + this.input.value);
                this.emit("play-video", this.input.value);
                this.removeError();
            }
        });

        this.addToPlaylist.addEventListener("click", event => {
            if (this.isYoutubeLink(this.input.value)) {
                console.log("VideoLinkInput: Emitting add-to-playlist with " + this.input.value);
                this.emit("add-to-playlist", this.input.value);
                this.removeError();
            }
        });
    }
};


 class Playlist {
    constructor(socket, options) {
        this.socket = socket;
        this.list   = options.list
        
        this.videoTemplate = new HTMLTemplate(
            `<div class="video clearfix" data-id="{{id}}">
                <div class="thumb">
                    <img src="{{thumb}}" alt="Thumb">
                    <span class="duration">{{duration}}</span>
                </div>
                <div class="title">{{title}}</div>
                <div class="remove"><i class="fas fa-trash-alt"></i></div>
            </div>`
        );
    }

    add(video) {
        this.list.innerHTML += this.videoTemplate.render(video);
    }

    remove(id) {
        let video = this.list.querySelector(`.video[data-id="${id}"`);
        this.list.removeChild(video);
    }

    videoExists(id) {
        return this.list.querySelector(`[data-id="${id}"`) !== null;
    }

    bindEvents() {
        let self = this;

        this.socket.on("playlist-new-video",    video => { this.add(video); });
        this.socket.on("playlist-remove-video", video => { this.remove(video); });

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
}

const clientRoom = {

    socket: io({transports: ["polling"]}),
    
    connectToRoom() {
        return new Promise((resolve, reject) => {
            
            let id = window.location.href.split("/").slice(-1)[0];
            console.log(`Connecting to room ${id}`);

            this.socket.emit("join-room", id); 
            this.socket.on("join-success", id => {
                this.socket = io("/" + id, {transports: ["polling"]});
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
        console.log("Emitting new-user with name " + this.userDisplay.username);
        this.socket.emit("new-user", this.userDisplay.username);

        this.socket.on("disconnect", () => console.log("Disconnected..."));
        this.socket.on("reconnect", () => {
            console.log("Reconnected.");
            this.socket.emit("new-user", this.userDisplay.username);
        });
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

                this.bindEvents(); 
                [this.userDisplay, this.chat, this.videoLinkInput].forEach(component => {
                    component.bindEvents();
                });
            })
            .catch(error => {
                console.log(error);   
            });

    }
};

clientRoom.init();
