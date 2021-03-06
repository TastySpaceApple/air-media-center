var path = require('path');
var fs = require('fs');
var http = require('http');
var url = require('url');	
	
function TranscodingServer(config,onstart){

	var self=this;
	// load config
	self.config = config || {};	
	var defaults={
		'alwaystranscode':false,
		'hardcodesubs':false,
		'customsubtitle':'',
		'ffmpegthreads':10,
		'ffmpegpreset':'fast', //fast
		'ffmpegaudioenc':'copy',
		'segmentsize':10,
		'ffmpegdir':'G:\\Develop\\Tools\\ffmpeg\\bin',
		'workdir' : 'G:\\tmp',
		'host' : '10.0.0.6'
	};
	for(var key in defaults)
		self.config[key] = defaults[key];

	// initialize object
	self.duration=-1;	
	self.bitrate=-1;	
	self.width=-1;	
	self.height=-1;	
	self.started=false;
	self.running = 0;	
	self.averagetime = -1;	
	self.clients = {};
	self.segments = new Array();
	// web server - create
    self.listener=http.createServer();							
	// web server - listening event handler
	self.listener.on('listening', function() {
		self.started=true;
		self.address='http://'+self.listener.address().address+':'+ self.listener.address().port;
		console.log('TranscodingServer: Listening on '+self.address);		
		if(onstart) onstart();
	});
	// web server - connection event handler
	self.listener.on('connection', function(conn) {
		var key = conn.remoteAddress + ':' + conn.remotePort;
		self.clients[key] = conn;
		conn.on('close', function() {
			delete self.clients[key];
		});
	});			
	// web server - request event handler
	self.listener.on('request', function(req,res) {
		
		var videoRegex=/\/segment(\d+).ts/;			
		var defaultRegex=/\/default-subtitle(\d+).vtt/;			
		var customRegex=/\/custom-subtitle(\d+).vtt/;			
		var info=url.parse(req.url);
		console.log(req.url);
		//
		if(info.pathname=='/'){
			self.createInfo(res);
		}else if(info.pathname=='/transcode-test'){	
			self.createTest(res);
		}else if(info.pathname=='/main.m3u8'){		
			if(self.config.hardcodesubs){
				self.createHLS(res);
			}else{
				self.createPlaylist(res);			
			}
		}else if(info.pathname=='/video.m3u8'){		
			self.createHLS(res);
		}else if(info.pathname=='/video.mpd'){						
			self.createDASH(res);
		}else if(videoRegex.test(info.pathname)){
			var match=videoRegex.exec(req.url);
			var index=parseInt(match[1]);
			self.createSegmentTS(index,res);
		}else if(info.pathname=='/default-subtitle-full.m3u8'){						
			self.createListVTT('default-subtitle-full.vtt',res);		
		}else if(info.pathname=='/default-subtitle-full.vtt'){						
			self.createFullVTT(self.config.subtitles, res);
		}else{					
			self.createNotFound(res,req.url);
		}
	});
	self.probeInput();
}

TranscodingServer.prototype.msToTime=function(ms){
	var dt=new Date(1970,0,1);
	var s = "000" + (ms % 1000);
	dt.setMilliseconds(ms);
	return dt.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1')+'.'+s.substr(s.length-3);
}

TranscodingServer.prototype.timeToMs=function(str){
  var hhRegex=/(\d+):(\d+):(\d+)(?:[,.])(\d+)/;			 
  var mmRegex=/(\d+):(\d+)(?:[,.])(\d+)/;			 
  var ms=0;
  // 
  if(hhRegex.test(str)){
	var match=hhRegex.exec(str);
	ms+=parseInt(match[4]);
	ms+=parseInt(match[3])*1000;
	ms+=parseInt(match[2])*60000;
	ms+=parseInt(match[1])*3600000;
  }else if(mmRegex.test(str)){
    var match=mmRegex.exec(str);
	ms+=parseInt(match[3]);
	ms+=parseInt(match[2])*1000;
	ms+=parseInt(match[1])*60000;
  }
  //
  return(ms)
}

TranscodingServer.prototype.start = function() {
  var self=this;
  //
  if(self.config.host){
	self.listener.listen(0, self.config.host);	  
  }else{
	self.listener.listen(0);	  
  }
};

TranscodingServer.prototype.stop = function() {
	var path = require('path');	
	var self=this;
	// never started/already closed
	if(self.started!=true) return;	
	// ok, close
	self.listener.close();
	self.started=false;
	// close open clients
	for (var key in self.clients) self.clients[key].destroy();
	
	// delete segment files	
	for (var c=0;c<self.segments.length;c++){
		var curr=self.segments[c];
		fs.unlink(path.join(self.config.workdir,curr.outfile), function (err) {});				
	}
	console.log('TranscodingServer - stopped');						
};

TranscodingServer.prototype.probeInput=function() {
	var self=this;
	var fs = require('fs');	
	var path = require('path');	
	// probe
			console.log("LOOK AT ME! 222");
	self.probe({
		infile: self.config.infile,
		onprobe: function(info){
			self.duration=parseFloat(info.format.duration);
			self.bitrate=parseInt(info.format.bit_rate);
			if(info.streams[0].codec_type=='video'){
				self.width=info.streams[0].width
				self.height=info.streams[0].height;
				self.video_codec=info.streams[0].codec_name;
				self.audio_codec=info.streams[1].codec_name;
			}else{
				self.width=info.streams[1].width
				self.height=info.streams[1].height;
				self.video_codec=info.streams[1].codec_name;
				self.audio_codec=info.streams[0].codec_name;
			}
			// create segments
			for(var c=0;c<self.duration/self.config.segmentsize;c++){
				var config={
					index: c,
					outfile: 'segment'+c+'.ts',
					timestart: c*self.config.segmentsize,
					timelength: Math.min(self.duration,(c+1)*self.config.segmentsize)-c*self.config.segmentsize,
					finished: false,
					working: false
				};
				self.segments.push(config);
			}
			self.start();
		}
	});
}

TranscodingServer.prototype.createSegmentTS=function(index,res) {
	var path = require('path');	
	var self=this;
	var segment=self.segments[index];
	this.transcodeSegmentTS(segment);
	//
	if(!segment){
		if(res) self.createNotFound(res,'/segment'+index+'.ts');				
	}else if(segment.filelength){
		if(res){ 
			fs.createReadStream( path.join(self.config.workdir, segment.outfile) ).pipe( res );
			/*fs.readFile(path.join(self.config.workdir, segment.outfile),function(err,data){
				res.writeHead(200, {'Content-Type': 'video/MP2T','Content-Length': segment.filelength });										
				res.end(data);
			});		*/
		}
	}else{ 
		setTimeout(function(){ self.createSegmentTS(segment.index,res); },1000);									
	}
}

TranscodingServer.prototype.createFullVTT=function(filename,res) {
	var self=this;
	var regex=/([0-9:.,]+)\s+-->\s+([0-9:.,]+)/;
	var start=false;
	// reads SRT or VTT and writes a VTT
	fs.readFile( filename, function (err, data) {
		if (err) throw err;
		var lines=data.toString('utf8').split('\n');
		// write header
		res.write('WEBVTT\n');
		res.write('X-TIMESTAMP-MAP=MPEGTS:90000, LOCAL:00:00:00.000\n\n');
		for(var c=0;c<lines.length;c++){
			var curr=lines[c].trim();
			//
			if(curr=='' && start){
				res.write('\n');			
				start=false;
			}else if(regex.test(curr)){
				var match=regex.exec(curr);
				var from=self.timeToMs(match[1]);
				var to=self.timeToMs(match[2]);
				res.write(self.msToTime(from)+' --> '+self.msToTime(to)+'\n');
				start=true;
			}else if(start){
				res.write(curr+'\n');
			}
		}
		res.end();
	});			
}

TranscodingServer.prototype.createListVTT=function(filename,res) {
	var path = require('path');
	var self=this;
	// calc segment size
	res.writeHead(200, {'Content-Type': 'application/x-mpegURL'});
	res.write('#EXTM3U\n');
	res.write('#EXT-X-VERSION:5\n');
	res.write('#EXT-X-TARGETDURATION:'+Math.ceil(self.duration)+'\n');
	res.write('#EXT-X-MEDIA-SEQUENCE:0\n');
	res.write('#EXT-X-PLAYLIST-TYPE:VOD\n');
	res.write('#EXTINF:'+Math.ceil(self.duration)+',\n');
	res.write(filename+'\n');
	res.write('#EXT-X-ENDLIST\n');
	res.end();
}

TranscodingServer.prototype.createPlaylist=function(res) {

	var self=this;
	//
	res.writeHead(200, {'Content-Type': 'application/x-mpegURL'});
	res.write('#EXTM3U\n');
	res.write('#EXT-X-VERSION:5\n');
	if(self.config.subtitles){
		res.write('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Default Subtitle",FORCED=NO,AUTOSELECT=YES,URI="default-subtitle-full.m3u8"\n');	
		res.write('#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH='+self.bitrate+',RESOLUTION='+self.width+'x'+self.height+',SUBTITLES="subs"\n');
	}
	else{
		res.write('#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH='+self.bitrate+',RESOLUTION='+self.width+'x'+self.height+'\n');
	}
	res.write('video.m3u8\n');
	res.end();
}

TranscodingServer.prototype.createHLS=function(res) {
	var path = require('path');
	var self=this;
	//
	res.writeHead(200, {'Content-Type': 'application/x-mpegURL'});
	res.write('#EXTM3U\n');
	res.write('#EXT-X-VERSION:5\n');
	res.write('#EXT-X-TARGETDURATION:'+(self.config.segmentsize+1)+'\n');
	res.write('#EXT-X-MEDIA-SEQUENCE:0\n');
	res.write('#EXT-X-PLAYLIST-TYPE:VOD\n');
	for (var c=0;c<self.segments.length;c++){
		res.write('#EXTINF:'+self.segments[c].timelength+',\n');
		res.write(path.basename(self.segments[c].outfile)+'\n');
	}
	res.write('#EXT-X-ENDLIST\n');
	res.end();
}

TranscodingServer.prototype.createDASH=function(res) {
	var path = require('path');
	var self=this;
	//
	res.writeHead(200, {'Content-Type': 'application/dash+xml'});
	res.write('<?xml version="1.0"?>\n');
	res.write('<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" minBufferTime="PT10S" type="static" mediaPresentationDuration="PT'+Math.round(self.duration)+'S" profiles="urn:mpeg:dash:profile:full:2011">\n');
	res.write('<ProgramInformation moreInformationURL="http://popcorntime.io">\n');
	res.write('<Title>Popcorn Time</Title>\n');
	res.write('</ProgramInformation>\n');
	res.write('<Period duration="PT'+Math.round(self.duration)+'S">\n');
	res.write('<AdaptationSet segmentAlignment="true" maxWidth="'+self.width+'" maxHeight="'+self.height+'" par="'+self.width+':'+self.height+'" subsegmentAlignment="true">\n');
	res.write('<Representation id="1" mimeType="video/mp2t" width="'+self.width+'" height="'+self.height+'" bandwidth="'+self.bitrate+'">\n');
	res.write('<SegmentList>\n');
	for (var c=0;c<self.segments.length;c++){
		res.write('<SegmentURL media="'+path.basename(self.segments[c].outfile)+'"/>\n');
	}
	res.write('</SegmentList>\n');
	res.write('</Representation>\n');
	res.write('</AdaptationSet>\n');
	res.write('</Period>\n');
	res.write('</MPD>\n');
	res.end();
}

TranscodingServer.prototype.createNotFound=function(res,url) {
	res.writeHead(404, {'Content-Type': 'text/html'});							
	res.write('<html>');
	res.write('<head><title>Transcoding Server</title></head>');
	res.write('<body>');
	res.write('<h1>404 Not Found</h1>');			
	res.write('<p>'+url+'</p>');			
	res.write('</body>');
	res.write('</html>');
	res.end();
}

TranscodingServer.prototype.createTranscoderArgs=function(segment){
	var opt = [
        '-y',
        '-i',
        this.config.infile,
        '-t', this.config.segmentsize,
        '-ss', this.config.segmentsize * (segment.index),
		'-preset', 'veryfast'
    ];

    // h264 && aac
    if ( this.video_codec == "h264" ) {
        opt = opt.concat([
            '-c:v', 'libx264', // libx264 || copy
            '-c:a', 'aac', // aac || copy
            '-strict', '-2',
            '-vbsf', 'h264_mp4toannexb'
        ]);
    }
    else {
        opt = opt.concat([
            '-c:v', 'linx264',
            '-c:a', 'aac',
            // '-g', 100,
            // '-vcodec', 'copy',
            // '-acodec', 'copy',
            '-b', '500k',
            '-ac', '2',
            '-ar', '44100',
            '-ab', '32k'
        ]);
    }
	
	opt.push( path.join(this.config.workdir, segment.outfile) );
	
	return opt;
}
TranscodingServer.prototype.transcodeSegmentTS = function(segment){
	if(segment.working) return;
	segment.working = true;
	var child = require('child_process');
	var ffmpegPath=path.join(this.config.ffmpegdir, 'ffmpeg');
	var envs = process.env;
	var self=this;
	// environment for ffmpeg
	envs['FC_CONFIG_DIR'] = path.resolve(this.config.ffmpegdir, 'fonts/');
	envs['FC_CONFIG_FILE'] = path.resolve(this.config.ffmpegdir, 'fonts/fonts.conf');
	envs['FONTCONFIG_FILE'] = path.resolve(this.config.ffmpegdir, 'fonts/fonts.conf');
	envs['FONTCONFIG_PATH'] = path.resolve(this.config.ffmpegdir, 'fonts/'); 			
	// start ffmpeg
	var ffmpeg=child.execFile( 
		ffmpegPath, 
		self.createTranscoderArgs(segment),
		{ cwd: self.config.workdir, env: envs },
		function (error, stdout, stderr) {
			//
			
			if(!error){
				var stats=fs.statSync(path.join(self.config.workdir, segment.outfile));
				segment.filelength = stats["size"];
				segment.finished = true;
			}else
				console.log(error);
			
		}
	);
}
TranscodingServer.prototype.runTranscoder=function(args) {
	var child = require('child_process');
	var path = require('path');
	var fs = require('fs');
	var ffmpegPath=path.join(this.config.ffmpegdir, 'ffmpeg');			
	var envs = process.env;
	var self=this;
	// environment for ffmpeg
	envs['FC_CONFIG_DIR'] = path.resolve(this.config.ffmpegdir, 'fonts/');
	envs['FC_CONFIG_FILE'] = path.resolve(this.config.ffmpegdir, 'fonts/fonts.conf');
	envs['FONTCONFIG_FILE'] = path.resolve(this.config.ffmpegdir, 'fonts/fonts.conf');
	envs['FONTCONFIG_PATH'] = path.resolve(this.config.ffmpegdir, 'fonts/'); 			
	// start ffmpeg
	var ffmpeg=child.execFile( 
		ffmpegPath, 
		self.createTranscoderArgs(args),
		{ cwd: self.config.workdir, env: envs },
		function (error, stdout, stderr) {
			if(args.onstderr) args.onstderr(stderr);
			if(args.onstdout) args.onstderr(stdout);
			//
			if(error){
				if(args.onerror) args.onerror();
			}else{
				if(args.onfinish) args.onfinish();
			}
		}
	);
	// install exit event handler
	ffmpeg.on('exit', function(code,signal) {
		if(signal!=null && args.onkill) args.onkill();
	});				
	return(ffmpeg)
};

TranscodingServer.prototype.probe=function(args) {
	var child = require('child_process');
	console.log(this.config.ffmpegdir);
	var ffprobePath=path.join(this.config.ffmpegdir, 'ffprobe');				
	//
	child.execFile(
		ffprobePath,[ 
			'-show_entries', 'format=duration,bit_rate:stream=width,height,codec_type,codec_name', 
			'-print_format', 'json',
			'-i', args.infile
		],
		function (error, stdout, stderr) {
			if(error) console.log(stderr);
			if(args.onprobe) args.onprobe(JSON.parse(stdout));
		}
	);			
};
exports.TranscodingServer = TranscodingServer;