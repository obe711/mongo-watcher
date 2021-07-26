/**
 * The MIT License (MIT)
* 
* Copyright (c) 2021 Obediah Benjamin Klopfenstein
* Lib - Node JS
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

exports.scrub_creds = function scrub_creds(url) {
  return url.replace(/^(https?:\/\/)[^:]+:[^@]+@(.*)$/, '$1$2'); // Scrub username and password
}

exports.JP = JSON.parse;
exports.JS = JSON.stringify;
exports.JDUP = function (obj) { return JSON.parse(JSON.stringify(obj)) };

var timeouts = {
  'setTimeout': setTimeout
  , 'clearTimeout': clearTimeout
}

exports.setTimeout = function () { return timeouts.setTimeout.apply(this, arguments) }
exports.clearTimeout = function () { return timeouts.clearTimeout.apply(this, arguments) }
exports.timeouts = function (set, clear) {
  timeouts.setTimeout = set
  timeouts.clearTimeout = clear
}

var debug = require('debug')

function getLogger(name) {
  return {
    "trace": noop
    , "debug": debug('follow:' + name + ':debug')
    , "info": debug('follow:' + name + ':info')
    , "warn": debug('follow:' + name + ':warn')
    , "error": debug('follow:' + name + ':error')
    , "fatal": debug('follow:' + name + ':fatal')

    , "level": { 'level': 0, 'levelStr': 'noop' }
    , "setLevel": noop
  }
}

function noop() { }

exports.log4js = { 'getLogger': getLogger }
