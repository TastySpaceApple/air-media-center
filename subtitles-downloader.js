var OS = require('opensubtitles-api');
var userAgent = 'Popcorn Time v1';
var path = require('path')
var http = require('http');
var fs = require('fs');

var OpenSubtitles;

exports.SubtitlesDownloader = {
	login : function(user, pass){
		OpenSubtitles = new OS(userAgent, 'Spacey', 'vosojihoto');
	},
	process : function (filename, callback){
		if(!OpenSubtitles) OpenSubtitles = new OS(userAgent);
		var fpath = path.parse(filename);
		var dest = path.join(fpath.dir, fpath.name) + '.srt';
		fs.stat(dest, function(err, stat) {
			if(err == null) {
				callback(dest);
			} else {
				console.log('Searching for subtitles...');
				OpenSubtitles.search({
					sublanguageid: 'en',
					lang:'en',
					path: filename
				}).then(function(data){
					console.log('Subtitles found. Downloading');
					downloadFile(data.en.url, dest, callback);
				});				
			}
		});

	},
}
function downloadFile (url, dest, callback){
	console.log('Downloading from '+url);
	var file = fs.createWriteStream(dest);
	var request = http.get(url, function(response) {
		response.pipe(file);
		callback(dest);
	});
}
