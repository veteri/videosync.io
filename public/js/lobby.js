const ClientCreateRoom = {

    socket: io("/lobby"),
    FQDN: "https://watch.20iq.club/",
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
        this.bindEvents();
    }

};

ClientCreateRoom.init();
