const clientRoom = {

    socket: io(),

    users: {
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
            socket.on("update-users", users => {
                this.container.innerHTML = "";
                users.forEach(user => this.add(user));
            });
        }
    },


    bindEvents() {
        this.socket.on("ok", () => console.log("got ok"));
    },

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
            this.socket.on("join-bad-id", () => reject());

        });
    }   

    init() {
        this.connectToRoom()
            .then(this.bindEvents);
    }
};

clientRoom.init();
