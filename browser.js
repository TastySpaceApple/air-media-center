/**
 * node-airplay
 *
 * @file bojour server
 * @author zfkun(zfkun@msn.com)
 * @thanks https://github.com/benvanik/node-airplay/blob/master/lib/airplay/browser.js
 */

var util = require( 'util' );
var events = require( 'events' );

var mdns = require( 'mdns-js' );
var TIMEOUT = 10000;

var Browser = function(  ) {
    events.EventEmitter.call( this );
    this.init(  );
};

util.inherits( Browser, events.EventEmitter );

exports.Browser = Browser;

Browser.prototype.init = function (  ) {
    var self = this;

    this.devices = {};

    var browser = new mdns.createBrowser(mdns.tcp('airplay'));

    var mdnsOnUpdate = function(data) {
        if(data.port && data.port == 7000){
            var info = data.addresses;
            var name = data.fullname.split('.')[0]
			self.emit('deviceOn', {host: data.addresses[0], port : data.port, name : name});
        }
    };
    browser.on('ready', function () {
		console.log('ready');
        browser.discover();
    });
    browser.on('update', mdnsOnUpdate);

    setTimeout(function onTimeout() {
      browser.stop();
    }, TIMEOUT);

};