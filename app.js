var filename = process.argv[2]; //"E:\\Downloads\\Torrents\\Series\\MrRobot\\Mr Robot S01E01 720p HDTV x264 AAC - Ozlem\\Mr Robot S01E01 720p HDTV x264 AAC - Ozlem.mp4";
var browser = new (require( './browser' ).Browser)();
var AirplayClient = require( './airplay-client' ).Client;
var TranscodingServer = require('./transcoder').TranscodingServer;
var SubtitleDownloader = require('./subtitles-downloader').SubtitlesDownloader;

var client;
var hls;

var config = require('./config.json')

SubtitleDownloader.login(config['opensubtitles-credentials'].user, config['opensubtitles-credentials'].pass);

SubtitleDownloader.process(filename, function(srt_file){
	
	hls = new TranscodingServer( {infile : filename, subtitles : srt_file} );
	
	if(client)
		setTimeout(function(){
			client.play(hls.address+'/main.m3u8');
		}, 1000);
});

browser.on( 'deviceOn', function( device ) {
	console.log('connected to ' + device.name);
	client = new AirplayClient(device.host);
	if(hls){
		client.play(hls.address+'/main.m3u8');
		console.log(hls.address+'/main.m3u8');
	}
});