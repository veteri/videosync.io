/**
 * Created by Midi on 13.07.2018.
 */


let request = require("request");

let properties = {
    key: "AIzaSyAh93tgIfcLie-rkURQa-fPIQUB2i9LkX4",
    part: "snippet,contentDetails",
    id: "NTc-IvO0saI"
};

let url = "https://www.googleapis.com/youtube/v3/videos";


request({url: url, qs: properties}, function(error, res, body) {
    if (error) console.log(error);

    let video = JSON.parse(body).items[0];
    console.log(video.contentDetails.duration);
    console.log(video.snippet.title);
    console.log(video.snippet.thumbnails.high.url);
});