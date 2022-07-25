import fs from 'fs'
import util from 'util'
import Promise from 'bluebird'

import gm from 'gm';
const im = gm.subClass({ imageMagick: true });

import express from 'express';
import multer from 'multer';
import imagemin from 'imagemin';
import imageminGifSicle from './imagemin-gifsicle.js';
import toArray from 'stream-to-array';
import sbuff from 'simple-bufferstream';
import mimetypes from 'mime-types';

Promise.promisifyAll(im.prototype);

function fileFilter(req, file, cb) {
    console.log('file is', file)
    cb(null,true);
}

const storage = multer.memoryStorage();
const upload = multer({ dest: 'uploads/', storage: storage });
const app = express();
app.use(express.static('public', {
    index: process.env['securityKey'] === undefined || process.env['securityKey'].length < 10 ? 'index-security-key.html' : 'index.html'
}));

function getBinaryData(req, res, next) {
    var data = [];
    req.on('data', function(chunk) { 
        data.push(chunk);
    });

    req.on('end', function() {
        req.body = Buffer.concat(data);
        next();
    });
}

function getMimeType (features) {
    if (features.format === 'MVG') {
        return 'image/svg+xml';
    } else {
        return mimetypes.lookup(features.format)
    }
}

async function streamToBuffer(fileStream) {
    try {
        var parts = await toArray(fileStream);
        const buffers = parts
                .map(part => util.isBuffer(part) ? part : Buffer.from(part));
        return Buffer.concat(buffers);
    } catch (err) {
        console.log('Something went wrong converting stream to buffer');
        throw err;
    }
}

async function processGif (features, buffer, options) {
    let width = features.size.width;
    if (options.width && options.width <= width) {
        width = options.width;
    }

    return await imagemin.buffer(buffer, {plugins: [imageminGifSicle({ interlaced: true, optimizationLevel: 3, resize: width })]});
}

async function processImage (features, buffer, options) {
    let image = new im(buffer)
        .strip()
        .interlace('Line')
        .quality(options.quality)

    if (options.width <= features.size.width) {        
      image.resize(options.width)
    }
    
    if (options.asProgressiveJpeg !== undefined && options.asProgressiveJpeg === 'true') {
        image = image.setFormat('pjpeg');
    } else {
        image = image.setFormat(features.format);
    }
    return await image.toBufferAsync();
}

async function handleResize (features, buffer, options) {
    switch (features.format) {
        case "GIF":        
            return await processGif(features, buffer, options);
        case "SVG":
        case "MVG":
            return new Promise(function(resolve, reject) {
                resolve(buffer);
            });
        default:
            return await processImage(features, buffer, options);
    }
}

async function processResizeAndRespond (req, res, features, options) {
    try {
        console.time("handleResize");
        var buffer = await handleResize(features, req.file.buffer, options);
        console.timeEnd("handleResize");

        console.time("size");
        var size = await im(buffer).sizeAsync();
        console.timeEnd("size");

        var header = {
            'Content-Type': getMimeType(features),
            'Image-Height': size.height,
            'Image-Width': size.width,
            'IsImage': features.format !== 'SVG' && features.format !== 'MVG'
        }
        res.writeHead(200, header);
        
        const s = sbuff(buffer.slice(0));
        s.pipe(res);
    } catch (err) {
        res.status(500).send({ 
            error: 'Something has gone wrong when processing the file!',
            message: err.message
        });
    }
}

app.post('/image/details', upload.single('image'), async function (req, res, next) {
    if (!req.file) {
        res.status(500).send({ 
            error: 'You need to supply a file with options'
        });
        return;
    }
    let options = req.body;
    const headers = req.headers

    if (!headers["security-key"] || headers["security-key"] !== process.env['securityKey']) {
        res.status(401).send({
            message: 'You are not authorised to use this service.'
        })
        return;
    }

    try {
        console.time("size");
        var size = await im(req.file.buffer).sizeAsync();
        console.timeEnd("size");
        
        if (!options.width || isNaN(parseInt(options.width))) {
            options.width = size.width
        }
        
        if (!options.quality || isNaN(parseInt(options.quality))) {
            options.quality = 80
        }

        const features = {
            size: size,
            format: await im(req.file.buffer).formatAsync()
        }

        var result = {
            size: req.file.buffer.length,
            mimeType: getMimeType(features),
            height: size.height,
            width: size.width,
            isImage: features.format !== 'SVG' && features.format !== 'MVG'
        }        
        res.status(200).send(result)
    }
    catch (err) {
        console.log('Error', err);
        res.status(500).send({ 
            error: 'Something has gone wrong when identifying the file!',
            message: err.message
        });
    }
});

app.post('/image/resize', upload.single('image'), async function (req, res, next) {
    if (!req.file || !req.body) {
        res.status(500).send({ 
            error: 'You need to supply a file with options'
        });
        return;
    }
    const options = req.body;
    const headers = req.headers

    if (!headers["security-key"] || headers["security-key"] !== process.env['securityKey']) {
        res.status(401).send({
            message: 'You are not authorised to use this service.'
        })
        return;
    }

    try {
        console.time("size");
        var size = await im(req.file.buffer).sizeAsync();
        console.timeEnd("size");
        
        if (!options.width || isNaN(parseInt(options.width))) {
            options.width = size.width
        }
        
        if (!options.quality || isNaN(parseInt(options.quality))) {
            options.quality = 80
        }

        const features = {
            size: size,
            format: await im(req.file.buffer).formatAsync()
        }

        await processResizeAndRespond(req, res, features, options)
    }
    catch (err) {
        console.log('Error', err);
        res.status(500).send({ 
            error: 'Something has gone wrong when identifying the file!',
            message: err.message
        });
    }
});


app.listen(3000, function () {
	console.log('ImageOptimizer listening on port 3000!!!');
});