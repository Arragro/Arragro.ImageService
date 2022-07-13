import execBuffer from 'exec-buffer';
import gifsicle from 'gifsicle';
import isGif from 'is-gif';

const imageminGifsicle = opts => buf => {
	opts = Object.assign({}, opts);

	if (!Buffer.isBuffer(buf)) {
		return Promise.reject(new TypeError('Expected a buffer'));
	}

	if (!isGif(buf)) {
		return Promise.resolve(buf);
	}

	const args = [] //'--no-warnings']; //, '--no-app-extensions'];

	if (opts.interlaced) {
		args.push('--interlace');
	}

	if (opts.resize) {
		args.push(`--resize=${opts.resize}x_`);
	}

	if (opts.optimizationLevel) {
		args.push(`--optimize=${opts.optimizationLevel}`);
	}

	if (opts.colors) {
		args.push(`--colors=${opts.colors}`);
	}

	args.push('--output', execBuffer.output, execBuffer.input);

	return execBuffer({
		input: buf,
		bin: gifsicle,
		args
	}).catch(err => {
		err.message = err.stderr || err.message;
		throw err;
	});
};

export default imageminGifsicle