class HTMLTemplate {
    constructor(template) {
        this.template = template; 
    }
    
    render(data) {
        return this.template.replace(/{{(.*?)}}/gi, (match, key) => data[key]);
    }

    renderElement(data) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = this.render(data);
        return wrapper.firstElementChild;
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
        this.color      = `color: ${this.getRandomColorString()}`;
        this.container  = options.container;
        this.messageScroll     = new SimpleBar(options.scrollWrapper, {
            autoHide: false 
        });

        this.emoteScroll     = new SimpleBar(options.emoteScrollWrapper, {
            autoHide: false 
        });

        this.chatBox    = options.chatBox;
        this.emoteBox   = options.emoteBox;
        this.showEmotes = options.showEmotes;
        this.emotes     = {};
        this.emotePaths = {};

        this.emoteTemplate   = new HTMLTemplate(
            `<img title="{{key}}" src="{{path}}" width="40">`
        );

        this.messageTemplate = new HTMLTemplate(
            `<div class="message {{author}}">
                <span class="timestamp">{{timestamp}}</span>
                <span class="author" style="{{color}}">{{author}}<span class="colon">:</span></span>
                {{content}}
            </div>`
        );

        this.bindEvents();
    }

    getRandomColorString() {
        const _0to255 = () => Math.round(Math.random() * (255 - 50)) + 50;
        return `rgb(${_0to255()}, ${_0to255()}, ${_0to255()})`;
    }

    getTimestamp() {
        let now = new Date();
        return `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
    }

    getMessage() {
        let message;
        message = this.chatBox.value.replace(/\n*$/gi, "");
        message = message.replace(/^\s*$/gi, "");
        return message;
    }

    addMessage(message) {
        message.timestamp = this.getTimestamp();
        this.container.appendChild(this.messageTemplate.renderElement(message));
    }

    setMessageHtml(html) {
        console.log("setting html in chat to " + html);
        this.container.innerHTML = html;
    }

    buildMessageHtml(messages) {
        return messages.reduce((html, message) => {
            message.timestamp = this.getTimestamp();
            console.log(message);
            return html + this.messageTemplate.render(this.wrapEmotes(message));
        }, ""); 
    }

    scrollDown() {
        this.messageScroll.getScrollElement().scrollTop = this.container.getBoundingClientRect().height;
    }
    
    wrapEmotes(message) {

        var expression, regex, replacement, link, self = this;
        Object.keys(this.emotes).forEach(emote => {

            expression = "[\\t \\n]" + emote + "(?!\\w)|^" + emote + "(?!\\w)";
            regex = new RegExp(expression, 'i');

            if (regex.test(message.content)) {
                regex = new RegExp(expression, 'gi');
                link = this.emotePaths[this.emotes[emote].type] + this.emotes[emote].image;
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
            self.emotePaths = response.paths;
            
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
            path = this.emotePaths[emote.type] + emote.image;
            return html + this.emoteTemplate.render({
                key: emoteKey,
                path: path
            });
        }, "");
    }

    bindEvents() {

        let self = this;
        
        //Load emotes and build emoteBox Html
        this.loadEmotes(() => { 
            this.setEmoteHtml(this.buildEmoteHtml());
            this.socket.emit("request-chat-update");
        });

        this.showEmotes.addEventListener("click", event => {
            $(this.emoteScroll.el).fadeToggle();
            $(this.emoteBox).fadeIn();
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
                    author : this.username,
                    color  : this.color,
                    content: this.chatBox.value
                });

                this.chatBox.value = "";
                //Fade out emote box when sending message
                $(this.emoteScroll.el).fadeOut();
            }
        });

        this.socket.on("chat-message", message => {
            console.log(message);
            if (document.hidden) {
                new Audio("/audio/chat_noti.mp3").play();
            }
            this.addMessage(this.wrapEmotes(message));
            this.scrollDown();
        });

        this.socket.on("chat-update", messages => {
            console.log(messages);
            this.setMessageHtml(this.buildMessageHtml(messages));
            setTimeout(() => this.scrollDown(), 1000);
        });
    }
}


class EventEmitter {
	constructor() {
		this.listeners = {};
	}

	on(event, callback) {
		if (!Array.isArray(this.listeners[event])) {
			this.listeners[event] = [];
		}

		this.listeners[event].push(callback);
	}

	emit(event, ...args) {
		if (this.listeners[event] !== undefined) {
			this.listeners[event].forEach(listener => listener(...args));
		}
	}

    removeListener(event, listener) {
        if (this.listeners[event] !== undefined) {
            let index = this.listeners[event].indexOf(listener);
            if (index > -1) {
                this.listeners[event].splice(index, 1);
            }
        }
    }

    once(event, listener) {
        let self = this;
        this.on(event, function temp(args = []) {
            self.removeListener(event, temp);
            listener(...args);
        });
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

 class History extends EventEmitter {
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
            </div>`
        );

        this.bindEvents();
    }

    add(video) {
        this.list.insertAdjacentElement("afterbegin", this.videoTemplate.renderElement(video));
    }

    setHtml(html) {
        this.list.innerHTML = html;
    }

    buildHtml(videos) {
        return videos.reduce((html, video) => this.videoTemplate.render(video) + html, "");
    }
    
    bindEvents() {

        this.socket.on("history-new-video",    video => this.add(video));
        this.socket.on("history-update", videos => {
            this.setHtml(this.buildHtml(videos));
        });

        this.list.addEventListener("click", event => {

            let video = event.target.closest(".video");
            if (video === null) {
                return;
            }

            let id = video.getAttribute("data-id");
            if (event.target.classList.contains("title") 
                        || event.target.parentElement.classList.contains("thumb")) {

                this.emit("video-play", id);
            }
        });
    }
}


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
        this.list.appendChild(this.videoTemplate.renderElement(video));
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
        this.socket.on("playlist-remove-video", video => this.remove(video.id));
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

class SliderControl extends EventEmitter {
    constructor(percent, options) {
        super();
        this.percent   = percent;
        this.container = options.container;
        this.fillBar   = options.fillBar;
        this.handle    = options.handle;
        this.mouse     = {
            x     : 0,
            y     : 0,
            isDown: false
        };

        this.emitDragEvents = options.emitDragEvents;

        this.setPercent(percent);
        this.bindEvents();
    }

    setPercent(percent) {
        if (percent < 0)   percent = 0;
        if (percent > 100) percent = 100;
        this.fillBar.style.width = `${percent}%`;
        this.handle.style.left   = `${percent}%`;
        this.emit("change", percent);
    }

    setPercentFromUserEvent(event) {
        let percent = this.getXPercent(event);
        this.setPercent(percent);

        if ((["mousemove", "mousedown"].includes(event.type) && this.emitDragEvents)
             || event.type === "mouseup") {

            this.emit("change-by-user", percent);
        }
    }

    getXPercent(mouseEvent) {
        let boundingRect = this.container.getBoundingClientRect();
        return ((mouseEvent.clientX - boundingRect.left) / boundingRect.width) * 100;
    }

    bindEvents() {

        document.addEventListener("mousedown", event => {
            this.mouse.isDown = true;
            if (event.button === 0 && this.container.contains(event.target)) {
                this.emit("mouse-down");
                this.setPercentFromUserEvent(event);
            }
        });

        document.addEventListener("mouseup", event => {
            this.mouse.isDown = false;
            if (event.button === 0 && this.container.contains(event.target)) {
                this.emit("mouse-up");
                this.setPercentFromUserEvent(event);
            }
        });

        this.container.addEventListener("mousemove", event => {
            event.preventDefault();
            if (this.mouse.isDown) {
                this.setPercentFromUserEvent(event);
            }
        });
    }
}

class UserNotificationDisplay extends EventEmitter {
    constructor(socket, options) {
        super();
        this.socket    = socket;
        this.container = options.container;
        this.outerID = null;
        this.innerID = null;
        this.notificationTemplate = new HTMLTemplate(`
            <div>
                <i class="{{fa-icon}} icon"></i>
                <div class="username">{{who}}</div>
            </div>
        `);

        this.bindEvents();
    }

    hasPreviousNotification() {
       return this.container.hasChildNodes(); 
    }

    removePreviousNotification() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }

    getCSSProp(elem, prop) {
        return window.getComputedStyle(elem, null)[prop];
    }

    getDuration(elem, kind) {
        return Number(this.getCSSProp(elem, `${kind}Duration`).slice(0 , -1)) * 1000;
    }

    queueFadeout() {
        let icon = this.container.querySelector(".icon");
        let iconAnimDur = this.getDuration(icon, "animation") || 500;
        let contTransDur = this.getDuration(this.container, "transition") || 500;
        let leanTimeMS = 500; 

        if (this.outerID) clearTimeout(this.outerID);   
        if (this.innerID) clearTimeout(this.innerID);

        this.outerID =  setTimeout(() => {
            this.container.style.opacity = 0;
            this.innerID = setTimeout(() => {
                this.container.classList.remove("active");
                this.innerID = null;
                this.outerID = null;
            }, contTransDur);
        }, iconAnimDur + leanTimeMS);
    }

    add(userEvent) {
        userEvent["fa-icon"] = {
            play       : "fas fa-play",
            pause      : "fas fa-pause",
            positioning: "fas fa-forward"
        }[userEvent.type]

        if (this.hasPreviousNotification()) {
            this.removePreviousNotification();
        }

        this.container.appendChild(this.notificationTemplate.renderElement(userEvent));
        this.container.classList.add("active");
        this.container.style.opacity = 1;
        this.queueFadeout();
    }

    bindEvents() {
        this.socket.on("user-event", userEvent => {
            this.add(userEvent);
            console.log(userEvent);
        });
    }
}

class W2GPlayerControls extends EventEmitter {
    constructor(player, options) {
        super();
        this.player           = player;
        this.container        = options.ctrlContainer;
        this.playBtn          = options.playBtn;
        this.playIcon         = options.playIcon;
        this.timeDisplay      = options.timeDisplay;
        this.timeMaxDisplay   = options.timeMaxDisplay;

        this.volumeSlider    = new SliderControl(this.getLocalVolume(), {
            container: document.querySelector(".volume.slider-control"),
            fillBar: document.querySelector(".volume.slider-control .fill"),
            handle: document.querySelector(".volume.slider-control .handle"),
            emitDragEvents: true
        });
        
        this.progress           = new SliderControl(0, {
            container: document.querySelector(".progress.slider-control"),
            fillBar  : document.querySelector(".progress.slider-control .fill"),
            handle   : document.querySelector(".progress.slider-control .handle"),
            emitDragEvents: false
        });

        this.videoLength      = 0;
        this.intervalID       = null;
        this.volumeStorageKey = options.volumeStorageKey;

        this.checkForExistingVolume();
        this.volumeSlider.setPercent(this.getLocalVolume());
        this.bindEvents();
    }

    updateTime() {
        if (this.videoLength === 0) return;
        this.timeDisplay.textContent    = this.buildTimeString(this.player.getTime());
        this.timeMaxDisplay.textContent = this.buildTimeString(this.videoLength);
    }

    updateProgress() {
        if (this.videoLength === 0) return;
        this.progress.setPercent((this.player.getTime() / this.videoLength) * 100);
    }

    startUpdate() {
        //console.log("Controls.startUpdate()");
        if (this.intervalID === null) {
            this.intervalID = setInterval(() => {
                this.updateTime();
                this.updateProgress();
            }, 200);
        } else {
            console.warn("W2GPlayerControls.startUpdate was called, but its already updating.");
        }
    }

    pauseUpdate() {
        //console.log("Controls.pauseUpdate()");
        if (this.intervalID !== null) {
            clearInterval(this.intervalID);
            this.intervalID = null;
        }
    }

    initialSync(video) {
        console.log("Initial sync of controls with video.");
        this.videoLength = video.length;
        this.updateTime();
        this.updateProgress();
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

    setVideoLength(length) {
        this.videoLength = length;
    }

    setIcon(icon) {
        switch (icon) {
            case "play":
                this.playIcon.classList.remove("ion-md-pause");
                this.playIcon.classList.add("ion-md-play");
                break;

            case "pause":
                this.playIcon.classList.remove("ion-md-play");
                this.playIcon.classList.add("ion-md-pause");
                break;
        }
    }

    getLocalVolume() {
        return localStorage.getItem(this.volumeStorageKey);
    }

    setLocalVolume(volume = 30) {
        localStorage.setItem(this.volumeStorageKey, volume);
    }

    checkForExistingVolume() {
        if (!this.getLocalVolume()) {
            this.setLocalVolume();
        }
    }

    bindEvents() {
        document.addEventListener("playerReady", () => {

            console.log("Playercontrol events bound.");
            this.volumeSlider.on("change-by-user", percent => {
                this.player.setVolume(percent);
                this.setLocalVolume(percent);
            });

            this.progress.on("change-by-user", percent => {
                console.log("progress changed by user");
                this.emit("playercontrols-positioning", this.videoLength * (percent / 100));
            });

            //Dont update player progress bar when it is being positioned (dragged)
            this.progress.on("mouse-down", () => {
                this.pauseUpdate();
            });

            //Once user lets go of mouse after positioning, start updating again (if video is running)
            this.progress.on("mouse-up", () => {
                if (!this.player.isPaused()) {
                    this.startUpdate();
                }
            });

            this.player.on("player-play",  () => {
                this.startUpdate();
                this.setIcon("pause");
            });
            
            this.player.on("player-pause", () => {
                this.pauseUpdate();
                this.setIcon("play");
            });

            this.player.on("player-video-ended", () => {
                this.pauseUpdate();
                this.progress.setPercent(100);
            });

            this.playBtn.addEventListener("click", () => {
                this.emit( this.player.isPlaying ? "playercontrols-pause" : "playercontrols-play");
            });
        });

    }
};

class W2GYoutubePlayer extends EventEmitter {
    constructor(socket, options) {
        super();
        this.socket = socket;
        this.id     = options.id;
        this.player = null;
        this.controls         = new W2GPlayerControls(this, options);
        this.overlay          = options.overlay; 
        this.volumeStoragekey = options.volumeStorageKey;
        this.bindEvents();
        this.loadIFrameAPI();
    }

    showOverlay() {
        this.overlay.classList.add("active");
    }

    hideOverlay() {
        this.overlay.classList.remove("active");
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
        document.dispatchEvent(new CustomEvent("playerReady"), {});
        this.socket.emit("player-ready");
    }

    onPlayerStateChange(event) {
        if (event.data === 0) {
            this.socket.emit("player-video-ended");
            this.emit("player-video-ended");
        }

        if (event.data === 1) {
            this.emit("player-playing");
        }

        if (event.data === 2) {
            this.emit("player-paused");
        }

        if (event.data === 3) {
            this.emit("player-buffering");
        }

        if (event.data === 5) {
            this.emit("player-cued");
        }
    }

    createPlayer() {
        this.player = new YT.Player(this.id, {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                rel: 0,
                showinfo: 0,
                autoplay: 0,
                controls: 0,
                fs      : 1
            },
            events: {
                'onReady': this.onPlayerReady.bind(this),
                'onStateChange': this.onPlayerStateChange.bind(this)
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

    play() {
        console.log("Playing video");
        this.player.playVideo();
        this.emit("player-play");
        this.isPlaying = true;
    }
    
    pause() {
        console.log("Pausing video");
        this.player.pauseVideo();
        this.emit("player-pause");
        this.isPlaying = false;
    }

    isPaused() {
        return !this.isPlaying;
    }

    getTime() {
        return this.player.getCurrentTime();
    }

    setVolume(volume) {
        this.player.setVolume(volume);
    }

    restoreLocalVolume() {
        let volume = this.controls.getLocalVolume();
        this.player.setVolume(volume);
        this.controls.volumeSlider.setPercent(volume);
    }

    setPosition(seconds) {
        this.player.seekTo(seconds, true);
        this.emit("player-positioned");
    }

    emitVideoChange(link) {
        this.socket.emit("player-video-change", link);
        console.log("Emitting player-video-change");
    }

    bindEvents() {
        //Avoid stupid global function enforcement from youtube iframe api by using custom events.
        document.addEventListener('onYouTubeIframeAPIReady', () => this.createPlayer(), false);

        document.addEventListener("playerReady", () => {
            this.socket.on("current-video", video => {
                console.log("Fetched currently running video.");
                this.once("player-playing", () => {
                    this.restoreLocalVolume();
                    this.socket.emit("request-pause");
                });
                
                this.once("player-paused", () => {
                    this.controls.initialSync(video);
                });

                this.setVolume(0);
                this.loadVideo(video.id);
            });
        });

        /*
         * Once someone changes video, add a "once" event listener
         * to the emitter, so that when video is buffered and starts playing
         * it is paused. Then send 'player-video-ready' event, signaling that
         * this client is ready for play.
         */
        this.socket.on("player-video-change", video => {
            this.once("player-playing", () => {
                this.pause();
                this.restoreLocalVolume();
                this.socket.emit("player-video-ready");
                console.log("Emitting player-video-ready");
            });

            this.showOverlay();
            console.log("player-video-change: showOverlay");
            this.controls.initialSync(video);
            this.setVolume(0);
            this.loadVideo(video.id)
        });

        /*
         * Once everyone is ready, server will send 'player-everyone-ready',
         * then just start playing the video.
         */
        this.socket.on("player-everyone-ready", () => {
            this.hideOverlay();
            console.log("Everyone is ready.");
            this.play();
        });

        this.socket.on("player-pause", time => {
            this.pause();
            this.setPosition(time);
        });

        this.socket.on("player-play", () => this.play());

        this.on("player-video-ended", () => this.pause());

        this.socket.on("player-video-positioning", time => {
            /*
             * If the video is playing and someone changes position:
             * Force sync for the next time video starts
             * playing again (after call to setPosition below if statement)
             */
            if (this.isPlaying) {
                this.once("player-playing", () => {
                    this.pause();
                    this.setVolume(this.controls.getLocalVolume());
                    this.socket.emit("player-video-ready");
                    console.log("Emitting player-video-ready");
                });
            } else {
                /*
                 * Otherwise, if video is paused:
                 * Once its done setting new position,
                 * just hide overlay and do nothing more.
                 */
                this.once("player-positioned", () => this.hideOverlay());
            }

            this.showOverlay();
            console.log("player-video-positioning, showOverlay");
            this.setVolume(0);
            this.setPosition(time);
        });

        this.controls.on("playercontrols-pause", () => {
            this.socket.emit("player-pause", this.getTime());
        });

        this.controls.on("playercontrols-play", () => {
            this.socket.emit("player-play");
        });

        this.controls.on("playercontrols-positioning", time => {
            this.socket.emit("player-video-positioning", time);
        });
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
            this.socket.on("join-bad-id", () => reject("join-bad-id"));

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
        this.socket.on("name-already-exists", () => {
            alert("Name already exists. (Maybe you have multiple tabs opened?)");
        });

        this.socket.on("disconnect", () => console.log("Disconnected..."));
        this.socket.on("reconnect", () => {
            console.log("Reconnected.");
            this.socket.emit("user-new", this.userDisplay.username);
        });

        //Link link-input to player and playlist
        this.videoLinkInput.on("video-play",   link => {
            console.log("Forwarding video-play to player");
            this.player.emitVideoChange(link);
        });

        this.videoLinkInput.on("playlist-add", link => this.playlist.emitNewVideo(link));

        //Link playlist clicks on videos to player
        this.playlist.on("video-play", id => {
            this.player.emitVideoChange(`https://www.youtube.com/watch?v=${id}`);
        });

        //Link history clicks on videos to player
        this.history.on("video-play", id => {
            this.player.emitVideoChange(`https://www.youtube.com/watch?v=${id}`);
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
                    username          : localStorage.getItem("watch20iq_chatAlias"),
                    container         : document.querySelector(".chat .messages"),
                    scrollWrapper     : document.querySelector(".chat .messages-scroll-wrapper"),
                    emoteScrollWrapper: document.querySelector(".chat .emotes-scroll-wrapper"), 
                    chatBox           : document.querySelector(".chat textarea.content"),
                    emoteBox          : document.querySelector(".chat .emotes"),
                    showEmotes        : document.querySelector(".chat .show-emotes")
                });

                this.videoLinkInput = new VideoLinkInput({
                    input        : document.querySelector(".yt-link"),
                    playVideo    : document.querySelector(".search > .play"),
                    addToPlaylist: document.querySelector(".search > .add-playlist"),
                });

                this.playlist = new Playlist(this.socket, {
                    list: document.querySelector(".playlist .body")
                });

                this.history = new History(this.socket, {
                    list: document.querySelector(".history .body")
                });

                this.player = new W2GYoutubePlayer(this.socket, {
                    id                 : "player",
                    overlay            : document.querySelector(".player .overlay"),
                    ctrlContainer      : document.querySelector(".video-controls"),
                    slider             : document.querySelector("#slider"),
                    playBtn            : document.querySelector(".play button"),
                    playIcon           : document.querySelector(".play button i"),
                    volumeSlider       : document.querySelector(".volume input"),
                    timeDisplay        : document.querySelector(".time > .current"),
                    timeMaxDisplay     : document.querySelector(".time > .length"),
                    volumeStorageKey   : "watch20iq_playerVolume"
                });

                this.userNotifications = new UserNotificationDisplay(this.socket, {
                    container: document.querySelector(".user-notifications")
                });

                this.bindEvents(); 
            })
            .catch(error => {
                console.log(error);   
                if (error === "join-bad-id") {
                    alert("The room you tried to join does not exist.");
                    window.location.href = "http://watch.20iq.club";
                }
            });
    }
};

clientRoom.init();
