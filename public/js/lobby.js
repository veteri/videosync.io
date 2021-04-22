const ClientCreateRoom = {

    socket: io({transports: ["websocket"]}),
    FQDN: "https://videosync.io",
    DEV: "/",

    requestRoom() {
        console.log("Sent request");
        this.socket.emit("request-room");
    },

    redirectToRoom(args) {
        console.log(args);
        window.location.href = `${this.DEV}room/${args.id}`;  
    },

    bindEvents() {

        document.querySelector(".create-room")
                .addEventListener("click", this.requestRoom.bind(this));

        this.socket.on("room-accepted", this.redirectToRoom.bind(this));
    },

    init() {
        //Apparently socket.io cant be instanciated with namespace + options..
        this.socket = io("/lobby");
        this.bindEvents();
    }

};

ClientCreateRoom.init();
