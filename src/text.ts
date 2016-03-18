import has, { add } from './has';
import request, { Response } from './request';
import Promise from './Promise';

/*
 * Strips <?xml ...?> declarations so that external SVG and XML
 * documents can be added to a document without worry. Also, if the string
 * is an HTML document, only the part inside the body tag is returned.
 */
function strip(text: string): string {
	if (!text) {
		return '';
	}

	text = text.replace(/^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im, '');
	let matches = text.match(/<body[^>]*>\s*([\s\S]+)\s*<\/body>/im);
	text = matches ? matches[1] : text;

	return text;
}

add('host-nashorn', typeof load === 'function' && typeof Packages !== 'undefined');

/*
 * Host-specific method to retrieve text
 */
let getText: (url: string, callback: (value: string) => void) => void;

if (has('host-browser')) {
	getText = function(url: string, callback: (value: string) => void): void {
		request(url).then(function(response: Response<string>) {
			callback(response.data);
		});
	};
}
else if (has('host-node')) {
	let fs = (<any> require).nodeRequire ? (<any> require).nodeRequire('fs') : require('fs');
	getText = function(url: string, callback: (value: string) => void): void {
		fs.readFile(url, { encoding: 'utf8' }, function(error: Error, data: string): void {
			if (error) {
				throw error;
			}

			callback(data);
		});
	};
}
else if (has('host-nashorn')) {
	getText = function (url, callback) {
			let stringBuffer, line,
				encoding = 'utf-8',
				file = new java.io.File(url),
				lineSeparator = java.lang.System.getProperty('line.separator'),
				input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
				content = '';
			try {
				stringBuffer = new java.lang.StringBuffer();
				line = input.readLine();

				if (line && line.length() && line.charAt(0) === 0xfeff) {
					line = line.substring(1);
				}

				if (line !== null) {
					stringBuffer.append(line);
				}

				while ((line = input.readLine()) !== null) {
					stringBuffer.append(lineSeparator);
					stringBuffer.append(line);
				}
				
				// Make sure we return a JavaScript string and not a Java string.
				content = String(stringBuffer.toString()); // String
			} finally {
				input.close();
			}
			callback(content);
		};
}
else {
	getText = function(): void {
		throw new Error('dojo/text not supported on this platform');
	};
}

/*
 * Cache of previously-loaded text resources
 */
let textCache: { [key: string]: any; } = {};

/*
 * Cache of pending text resources
 */
let pending: { [key: string]: any; } = {};

export function get(url: string): Promise <string> {
	let promise = new Promise <string> (function (resolve, reject) {
		getText(url, function (text) {
			resolve(text);
		});
	});

	return promise;
}

export function normalize(id: string, toAbsMid: (moduleId: string) => string): string {
	let parts = id.split('!');
	let url = parts[0];

	return (/^\./.test(url) ? toAbsMid(url) : url) + (parts[1] ? '!' + parts[1] : '');
}

export function load(id: string, require: DojoLoader.Require, load: (value?: any) => void, config?: DojoLoader.Config): void {
	let parts = id.split('!');
	let stripFlag = parts.length > 1;
	let mid = parts[0];
	let url = require.toUrl(mid);
	let text: string;

	function finish(text: string): void {
		load(stripFlag ? strip(text) : text);
	}

	if (mid in textCache) {
		text = textCache[mid];
	}
	else if (url in textCache) {
		text = textCache[url];
	}

	if (!text) {
		if (pending[url]) {
			pending[url].push(finish);
		} else {
			let pendingList = pending[url] = [finish];
			getText(url, function(value: string) {
				textCache[mid] = textCache[url] = value;
				for (let i = 0; i < pendingList.length; ) {
					pendingList[i++](value);
				}
				delete pending[url];
			});
		}
	} else {
		finish(text);
	}
}
