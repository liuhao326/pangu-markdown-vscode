// @ts-nocheck
/* jshint -W032 */ //关闭 jshint W032 的检查
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 * 方法被激活时调用的函数
 */
function activate(context) {
	/* if(!wsPath){
				vscode.window.showInformationMessage('建议在文件夹中打开文件以方便比较差异。是否打开文件夹？', Message).then(selection => {
					if (selection === Message) {
						let filePath = vscode.window.activeTextEditor.document.fileName;
						let fileFolder = filePath.replace(/\/.*$/, '');
						let uri = vscode.Uri.file(fileFolder);
						vscode.commands.executeCommand('vscode.openFolder', uri);
					}
				});
			} */
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pangu-markdown-vscode" is now active!');
	let format = vscode.commands.registerCommand('pangu-markdown-vscode.formatPangu', () => {
		let editor = new Editor();
		let doc = editor.getDoc();
		if (doc.languageId === "markdown") {
			vscode.window.activeTextEditor.edit((editorBuilder) => {
				let originText = doc.getText();
				let config = editor.getConfig('pangu-markdown-vscode');
				let newText = new PanguFormatter(config).pangu(originText);
				editorBuilder.replace(editor.getDocRange(), newText);
				const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
				console.log(wsPath);
				const Message = '确定';
				vscode.window.showInformationMessage('处理完成，比较差异？', Message).then(selection => {
					if (selection === Message) {
						const wsedit = new vscode.WorkspaceEdit();
						const filePath = vscode.Uri.file(wsPath + '/pangu-temp.md');
						wsedit.createFile(filePath, { ignoreIfExists: true });
						wsedit.insert(filePath, new vscode.Position(0, 0), originText);
						vscode.workspace.applyEdit(wsedit);
						let origin = filePath;
						let newOne = vscode.Uri.file(vscode.window.activeTextEditor.document.fileName);
						editor.diff(origin, newOne, 'originText —> newText');
					}
				});
			});
		} else {
			vscode.window.showInformationMessage('不能处理非 Markdown 格式的文件。');
		};
	});
	context.subscriptions.push(format);
	context.subscriptions.push(new Watcher());
}
exports.activate = activate;

module.exports = {
	activate
};

class Watcher {
	constructor() {
		let config = vscode.workspace.getConfiguration('pangu-markdown-vscode');
		if (config.get('autoFormatOnSave', false)) {
			let subscriptions = [];
			this._disposable = vscode.Disposable.from(...subscriptions);
			vscode.workspace.onWillSaveTextDocument(this._onWillSaveDoc, this, subscriptions);
		};
	};
	dispose() {
		this._disposable.dispose();
	};
	_onWillSaveDoc() {
		new PanguFormatter().pangu();
	};
};

class Editor {

	getDoc(){
		let doc = vscode.window.activeTextEditor.document;
		return doc;
	}

	getDocRange() {
		let doc = vscode.window.activeTextEditor.document;
		let start = new vscode.Position(0, 0);
		let end = new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
		let range = new vscode.Range(start, end);
		return range;
	};

	getConfig(extensionName){
		return vscode.workspace.getConfiguration(extensionName);
	}

	diff(left, right, title){
		vscode.commands.executeCommand('vscode.diff', left, right, title?title:undefined);
	}
}

class PanguFormatter {
	constructor(config) {
		this.config = config;
		this.CJK = String.raw`\u2e80-\u2eff\u2f00-\u2fdf\u3040-\u309f\u30a0-\u30fa\u30fc-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff`;
		this.ANS = String.raw`\w`;
		this.halfwidthChar = String.raw`\x00-\xff`;
		this.fullwidthPunctuation = "，。、《》？『』「」；∶【】｛｝—！＠￥％…（）";
		this.inser = 'ꏝ';
		this.units = config.get('units');
	};


	pangu(text) {
		/* 全局操作 */
		// 删除多余的换行
		text = this.condense(text);
		// 全角数字 ——> 半角数字
		text = this.replaceFullNums(text);
		// 全角英文 ——> 半角英文
		text = this.replaceFullChars(text);

		/* 逐行处理 */
		text = text.split("\n").map((line) => {
			// 处理标点
			line = this.replacePunctuation(line);
			// 删除多余的空格
			line = this.deleteSpaces(line);
			// 插入必要的空格
			line = this.insertSpace(line);
			return line;
		}).join("\n");
		this.log();
		return text;
	};

	/* 全角标点与其他字符之间不加空格 */
	deleteSpaces(text) {
		//全角标点与其他字符之间（注意避免替换掉语法空格）
		let fullwidthPunctuation = this.fullwidthPunctuation;
		text = text.replace(new RegExp(String.raw`(?<![-*]|\d.|- \[ \]|)(\s*)([${fullwidthPunctuation}])(\s*)`, "g"), '$2');

		// 去掉行内代码两端多余的空格
		text = text.replace(/(`)(\s*)([^`]*)(\s*)(`)/, '$1$3$5');

		// 去掉行末空格
		text = text.replace(/(\S)\s*$/g, '$1');

		// 去掉「123 °」和 「15 %」中的空格
		text = text.replace(/([0-9])\s*([°%])/g, '$1$2');
		return text;
	};

	/* 
	中英文之间（「豆瓣FM」等产品名词，按照官方所定义的格式书写）；
	中文与数字之间；
	英文标点与英文之间；
	数字与单位之间（°/%与数字之间不需要增加空格。）；
	短代码之间添加空格（争议）；
	链接之间增加空格（争议）
	 */
	insertSpace(text) {
		let CJK = this.CJK;
		let ANS = this.ANS;
		let config = this.config;
		let fullwidthPunctuation = this.fullwidthPunctuation;
		let textObj = new Text(text);

		// 中文与英文、中文与数字之间
		textObj.addSpace(`([${CJK}])`, `([${ANS}])`, true);
		
		// 行内代码
		if(config.get('addSpaceForCode')){
			textObj.addSpace('(`[^`\r\n]*`)', `([^${fullwidthPunctuation})`, true);
		}
		// 英文标点与英文之间
		// TODO：因容易影响到链接等内容而暂时没有添加点号、问号和冒号，(?<!http\s*|ftp\s*):
		textObj.addSpace(String.raw`([,;!]|\.\.\.)`, String.raw`([\w])`, true, true);

		// 链接之间增加空格
		if(config.get('addSpaceForLink')){
			textObj.addSpace(String.raw`(\[[^\[\]]*\]\([^\(\)]*\))`, String.raw`([\S])`, true);
		}

		// 产品名词（暂时打印）
		
		// 在单位之间
		textObj.addSpace(`([0-9])`, `(${this.units})`, true, true);
		return textObj.getText();
	};

	/* 删除多余空行；去掉会被忽略的回车 */
	condense(text) {
		let config = this.config
		// 删除超过 2 个的回车（Unix 的只有 LF，Windows 的需要 CR LF）
		if (config.get('deleteExtraBlankLines')) {
			text = text.replace(/(\n){3,}/g, "$1$1");
			text = text.replace(/(\r\n){3,}/g, "$1$1");
			// 删除文档结尾处多余的换行
			text = text.replace(/(\n){1,}$/g, '');
			text = text.replace(/(\r\n){1,}$/g, '');
		}
		if (config.get('deleteLFThatWillBeIgnored')) {
			// TODO
			/* text = text.replace(/(?<!\n)\n^\s*(?!-|\*|- []|[0-9]*\.)\s/g, "");
			text = text.replace(/\r\n^/g, ""); */
		}
		return text;
	};

	/* 
	使用全角中文标点；
	遇到完整的英文整句、特殊名词，其内容使用半角标点;
	简体中文使用直角引号（争议）；
	不重复使用标点符号；
	*/
	replacePunctuation(text) {
		const halfwidthChar = this.halfwidthChar;
		const config = this.config;
		const inser = this.inser;
		let textObj = new Text(text);
		/* 半角标点 ——> 全角标点（。？！，；：——－-～（）“”‘’……《》） */
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`([^.])`,
		String.raw`(\s*\.\s*)`, '。', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*\?+\s*)`, '？', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*\!+\s*)`, '！', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*\,+\s*)`, '，', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*\;+\s*)`, '；', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*\:+\s*)`, '：', true, true);
		textObj.replaceMid(`([^${halfwidthChar}])`, String.raw`(\S)`,
		String.raw`(\s*[-－–—]{2,}\s*)`, '——', true, true);
		//〜（似乎不那么必要）
		textObj.replaceWithIgnore(
			new RegExp(String.raw`([^${halfwidthChar}])(\s*～+\s*)`, 'g'), `〜`,
			[/~~(((?!~~).)*)~~/g, `${inser}${inser}$1${inser}${inser}`]
		);
		//（） 需防止替换：[...]:#(注释)、[...]:<>(注释)、[]()、![]()
		textObj.replaceWithIgnoreAll(
			[[/\(/g, '（'], [/\)/g, '）']],
			[/(\[[^\s\[\]][^\[\]]*\]:[\s]*([\S]*|<.*>)[\s]*)(\()(.*)(\))/g, `$1${inser}$4${inser}`],
			[/(\[[^\[\]]*\])(\()([^\(\)]*)(\))/g,`$1${inser}$3${inser}`]
		);
		//“” 需防止替换：[GitHub](https://github.com "GitHub 官网")
		textObj.replaceWithIgnore(
			new RegExp(String.raw`(\s*"\s*)([^${halfwidthChar}"][^"]*|[^"]*[^${halfwidthChar}"])(\s*"\s*)`,'g'),'“$2”',
			[
				new RegExp(String.raw`(\[.*\]\(\S+.*\s)(")(.*)(")(\s*\))`,'g'),
				`$1${inser}$3${inser}$5`
			]
		);
		// ‘’
		textObj.replaceWithIgnore(
			new RegExp(String.raw`(\s*'\s*)([^${halfwidthChar}'][^']*|[^']*[^${halfwidthChar}'])(\s*'\s*)`,'g'),'‘$2’',
			[
				new RegExp(String.raw`(\[.*\]\(\S+.*\s)(')(.*)(')(\s*\))`,'g'), 
				`$1${inser}$3${inser}$5`
			]
		);
		// ……
		// 数量>=3的句号或数量>=4的点号 ——> ......
		textObj.replace(/(。{3,}|\.{4,})/g, '......');
		// 多字节字符后的多个点 ——> ……
		textObj.replace(new RegExp(String.raw`([^${halfwidthChar}])(\.{3,})`, 'g'), '$……');
		// «» ——>《》
		textObj.replace(
			new RegExp(String.raw`(\s*«\s*)([^${halfwidthChar}«»][^«»]*|[^«»]*[^${halfwidthChar}«»])(\s*»\s*)`,'g'), `《$2》`);
		// ‹› ——>〈〉
		textObj.replace(
			new RegExp(String.raw`(\s*‹\s*)([^${halfwidthChar}‹›][^‹›]*|[^‹›]*[^${halfwidthChar}‹›])(\s*›\s*)`,'g'), `〈$2〉`);


		// 多个标点符号 ——> 一个标点符号
		if(config.get('condensePunctuation')){
			textObj.replace(/(！？|？！|[⁇⁉⁈‽❗‼⸘\?;¿!¡·,！？。，；：、"'“”‘’「」『』〖〗《》【】])\1+/g, '$1');
			textObj.replace(/([⁇⁉⁈‽❗‼⸘\?;¿!¡·,！？。，；：、〖〗《》【】])[⁇⁉⁈‽❗‼⸘\?;¿!¡·,！？。，；：、〖〗《》【】]+/g, '$1');
		}
		// 中文引号 ——> 直角引号
		if (config.get('covertChineseQuotations')) {
			textObj.replace(/‘/g, "『");
			textObj.replace(/’/g, "』");
			textObj.replace(/“/g, "「");
			textObj.replace(/”/g, "」");
		}
		// 英文引号 ——> 直角引号
		if(config.get('covertEnglishQuotations')){
			// ""
			textObj.replaceWithIgnore(/(")([^"]*)(")/g, "「$2」",[
				new RegExp(String.raw`(\[.*\]\(\S+.*\s)(")(.*)(")(\s*\))`,'g'), 
				`$1${inser}$3${inser}$5`
			]);
			// ''
			textObj.replaceWithIgnore(/(')([^']*)(')/g, "『$2』",[
				new RegExp(String.raw`(\[.*\]\(\S+.*\s)(')(.*)(')(\s*\))`,'g'), 
				`$1${inser}$3${inser}$5`
			]);
		}

		/* 完整的英文整句、特殊名词，其内容使用半角标点（暂时打印） */
		

		return textObj.getText();
	};

	/* 全角数字 ——> 半角数字 */
	replaceFullNums(text) {
		let config = this.config
		if(config.get('convertFullwidthNums')){
			" 全角数字。";
			text = text.replace(/０/g, "0");
			text = text.replace(/１/g, "1");
			text = text.replace(/２/g, "2");
			text = text.replace(/３/g, "3");
			text = text.replace(/４/g, "4");
			text = text.replace(/５/g, "5");
			text = text.replace(/６/g, "6");
			text = text.replace(/７/g, "7");
			text = text.replace(/８/g, "8");
			text = text.replace(/９/g, "9");
		}
		return text;
	};

	/* 全角字母 ——> 半角字母 */
	replaceFullChars(text) {
		let config = this.config
		if(config.get('convertFullwidthChars')){
			" 全角字母。";
			text = text.replace(/Ａ/g, "A");
			text = text.replace(/Ｂ/g, "B");
			text = text.replace(/Ｃ/g, "C");
			text = text.replace(/Ｄ/g, "D");
			text = text.replace(/Ｅ/g, "E");
			text = text.replace(/Ｆ/g, "F");
			text = text.replace(/Ｇ/g, "G");
			text = text.replace(/Ｈ/g, "H");
			text = text.replace(/Ｉ/g, "I");
			text = text.replace(/Ｊ/g, "J");
			text = text.replace(/Ｋ/g, "K");
			text = text.replace(/Ｌ/g, "L");
			text = text.replace(/Ｍ/g, "M");
			text = text.replace(/Ｎ/g, "N");
			text = text.replace(/Ｏ/g, "O");
			text = text.replace(/Ｐ/g, "P");
			text = text.replace(/Ｑ/g, "Q");
			text = text.replace(/Ｒ/g, "R");
			text = text.replace(/Ｓ/g, "S");
			text = text.replace(/Ｔ/g, "T");
			text = text.replace(/Ｕ/g, "U");
			text = text.replace(/Ｖ/g, "V");
			text = text.replace(/Ｗ/g, "W");
			text = text.replace(/Ｘ/g, "X");
			text = text.replace(/Ｙ/g, "Y");
			text = text.replace(/Ｚ/g, "Z");
			text = text.replace(/ａ/g, "a");
			text = text.replace(/ｂ/g, "b");
			text = text.replace(/ｃ/g, "c");
			text = text.replace(/ｄ/g, "d");
			text = text.replace(/ｅ/g, "e");
			text = text.replace(/ｆ/g, "f");
			text = text.replace(/ｇ/g, "g");
			text = text.replace(/ｈ/g, "h");
			text = text.replace(/ｉ/g, "i");
			text = text.replace(/ｊ/g, "j");
			text = text.replace(/ｋ/g, "k");
			text = text.replace(/ｌ/g, "l");
			text = text.replace(/ｍ/g, "m");
			text = text.replace(/ｎ/g, "n");
			text = text.replace(/ｏ/g, "o");
			text = text.replace(/ｐ/g, "p");
			text = text.replace(/ｑ/g, "q");
			text = text.replace(/ｒ/g, "r");
			text = text.replace(/ｓ/g, "s");
			text = text.replace(/ｔ/g, "t");
			text = text.replace(/ｕ/g, "u");
			text = text.replace(/ｖ/g, "v");
			text = text.replace(/ｗ/g, "w");
			text = text.replace(/ｘ/g, "x");
			text = text.replace(/ｙ/g, "y");
			text = text.replace(/ｚ/g, "z");
		}
		return text;
	};

	/* 专有名词使用正确的大小写；不使用不地道的缩写 */
	properNounsAndAbbreviations(){
		console.log('对于专有名词和英文缩写：');
		console.log("1. 如果文档中存在专有名词，请自行确认其大小写是否正确。\n2. 如果文档中使用了英文缩写，请自学确认缩写是否规范、通用。")
	}

	log(text){
		if(text){
			console.log(text);
			return;
		}
		let halfwidth = this.halfwidthChar;

		console.log("下列有关标点的操作需手动完成：")
		console.log(String.raw`1. 完整的英文整句、特殊名词，其内容建议使用半角标点。请在编辑器中开启搜索并手动输入正则匹配检查英文或数字周围的标点是否正确：\n([^${halfwidth}]|\s)(${halfwidth}+)([^${halfwidth}]|\s)`)
		console.log(String.raw`2. 除 1 中指出的位置及 Markdown 标记需使用半角标点以外，其他位置建议使用全角标点。请在编辑器中开启搜索并手动输入正则匹配检查半角标点是否应该转为全角标点：[\?~:!,\.'\"\-;\(\)\[\]\{\}]`)
		console.log("另：插件会将疑似重复的标点替换为一个，如需要保留请自行更正。")

		console.log('下列有关空白的操作需手动完成：');
		console.log('1. 「豆瓣FM」等产品名词应按照官方所定义的格式书写，插件可能错误地为其添加了空格，请自行检查；');
		console.log("2. 如果文档中存在用英文表示的单位，请自行在数字与单位之间添加空格（例外：单位为 ° 或 % 时不需要增加空格）。");
		
		this.properNounsAndAbbreviations();
	}
};

class noMeta {
	constructor(group1, group2, oneSide){
		this.group1 = group1;
		this.group2 = group2;
		this.oneSide = oneSide;
	}

	addSpace(text){
		text = this.replaceMid(text, String.raw`(\s*)`, ' ');
		return text;
	}

	replaceMid(text, needTo, replaceTo){
		text = text.replace(new RegExp(this.group1 + needTo + this.group2, "g"), `$1${replaceTo}$3`);
		if (!this.oneSide) {
			text = text.replace(new RegExp(this.group2 + needTo + this.group1, "g"), `$1${replaceTo}$3`);
		}
		return text;
	}
}

class withMeta extends noMeta {
	
	constructor(group1, group2, oneSide, meta1, meta2){
		super(group1, group2, oneSide);
		this.meta1 = meta1;
		this.meta2 = meta2;
	}

	replaceMid(text, needTo, replaceTo){
		let m1 = this.meta1;
		let m2 = this.meta2;
		let g1 = this.group1;
		let g2 = this.group2;
		//?默认为内部不包含meta1和meta2；默认空白不会影响样式
		text = text.replace(new RegExp(`(${m1})` + `(((?!${m1}|${m2}).)*)` + g1 + `(${m2})` + needTo + g2, "g"), `$1$2$4$5${replaceTo}$7`);
		text = text.replace(new RegExp(g1 + needTo + `(${m1})` + g2 + `(((?!${m1}|${m2}).)*)` + `(${m2})`, "g"), `$1${replaceTo}$3$4$5$7`);
		if(!this.oneSide){
			text = text.replace(new RegExp(`(${m1})` + `(((?!${m1}|${m2}).)*)` + g2 + `(${m2})` + needTo + g1, "g"), `$1$2$4$5${replaceTo}$7`);
			text = text.replace(new RegExp(g2 + needTo + `(${m1})` + g1 + `(((?!${m1}|${m2}).)*)` + `(${m2})`, "g"), `$1${replaceTo}$3$4$5$7`);
		}
		return text;
	}
}

class withLink extends noMeta {
	constructor(group1, group2, oneSide, meta1, meta2, meta3, meta4){
		super(group1, group2, oneSide);
		this.meta1 = meta1;
		this.meta2 = meta2;
		this.meta3 = meta3;
		this.meta4 = meta4;
	}

	replaceMid(text, needTo, replaceTo){
		let m1 = this.meta1;
		let m2 = this.meta2;
		let m3 = this.meta3;
		let m4 = this.meta4;
		let g1 = this.group1;
		let g2 = this.group2;

		//?默认两种元字符都不包含
		let repeate1 = `${m1}${m2}`;
		let repeate2 = `${m3}${m4}`;
		
		text = text.replace(new RegExp(`(${m1})([^${repeate1}]*)` + g1 + `(${m2}${m3})([^${repeate2}]*)(${m4})` + needTo + g2, "g"), `$1$2$3$4$5$6${replaceTo}$8`);
		text = text.replace(new RegExp(g1 + needTo + `(${m1})` + g2 + `([^${repeate1}]*)(${m2}${m3})([^${repeate2}]*)(${m4})`, "g"), `$1${replaceTo}$3$4$5$6$7$8`);
		if(!this.oneSide){
			text = text.replace(new RegExp(`(${m1})([^${repeate1}]*)` + g2 + `(${m2}${m3})([^${repeate2}]*)(${m4})` + needTo + g1, "g"), `$1$2$3$4$5$6${replaceTo}$8`);
			text = text.replace(new RegExp(g2 + needTo + `(${m1})` + g1 + `([^${repeate1}]*)(${m2}${m3})([^${repeate2}]*)(${m4})`, "g"), `$1${replaceTo}$3$4$5$6$7$8`);
		}
		return text;
	}
}

class Text {
	constructor(text){
		this.text = text;
	}

	getText(){
		return this.text;
	}

	replace(pattern, replacement){
		this.text = this.text.replace(pattern, replacement);
	}

	replaceWithIgnore(pattern, replacement, ignore){
		this.beforeIgnoreText = this.text;
		this.ignoredText = this.text.replace(ignore[0], ignore[1]);
		this.text = this.ignoredText.replace(pattern, replacement);
		this.recoverIgnore();
	}

	replaceWithIgnoreAll(repalceList, ...ignoreList){
		this.beforeIgnoreText = this.text;
		for (let index = 0; index < ignoreList.length; index++) {
			const ignore = ignoreList[index];
			this.ignoredText = this.ignoredText.replace(ignore[0], ignore[1]);
		}
		this.text = this.ignoredText;
		for (let index = 0; index < repalceList.length; index++) {
			const ignore = repalceList[index];
			this.text = this.text.replace(ignore[0], ignore[1]);
		}
		this.recoverIgnore();
	}

	recoverIgnore(){
		let beforeIgnore = this.beforeIgnoreText.split('');
		let ignored = this.ignoredText.split('');
		let text = this.text;
		for (let index = 0; index < beforeIgnore.length; index++) {
			if(beforeIgnore[index] != ignored[index] && ignored[index] == 'ꏝ'){
				text = text.replace('ꏝ', beforeIgnore[index]);
			}
		}
		this.text = text;
	}

	addSpace(group1, group2, considerMeta, oneSide){
		this.replaceMid(group1, group2, String.raw`(\s*)`, ' ', considerMeta, oneSide);
	}

	replaceMid(group1, group2, needTo, replaceTo, considerMeta, oneSide){
		let text = this.text;
		if (considerMeta) {
			let matchers = [];
			// （直接相邻）
			matchers.push(new noMeta(group1, group2, oneSide))
			// （考虑`）
			matchers.push(new withMeta(group1, group2, oneSide, "`", "`"));
			// （考虑*）
			matchers.push(new withMeta(group1, group2, oneSide, String.raw`\*\*\*`, String.raw`\*\*\*`));
			matchers.push(new withMeta(group1, group2, oneSide, String.raw`\*\*`, String.raw`\*\*`));
			matchers.push(new withMeta(group1, group2, oneSide, String.raw`\*`, String.raw`\*`));
			// （考虑==）
			matchers.push(new withMeta(group1, group2, oneSide, `==`, `==`));
			// （考虑~~）
			matchers.push(new withMeta(group1, group2, oneSide, `~~`, `~~`));
			// （考虑++）（+为正则元字符，需转义）
			matchers.push(new withMeta(group1, group2, oneSide, `\\+\\+`, `\\+\\+`));
			// （考虑_）
			matchers.push(new withMeta(group1, group2, oneSide, `_`, `_`));
			// （考虑<>）
			matchers.push(new withMeta(group1, group2, oneSide, `<`, `>`));
			// （考虑<u>）
			matchers.push(new withMeta(group1, group2, oneSide, `<u>`, `</u>`));
			// （考虑[]()）
			matchers.push(new withLink(group1, group2, oneSide, String.raw`\[`, String.raw`\]`, String.raw`\(`, String.raw`\)`));
			// （考虑[][]）
			matchers.push(new withLink(group1, group2, oneSide, String.raw`\[`, String.raw`\]`, String.raw`\[`, String.raw`\]`));

			for (let index = 0; index < matchers.length; index++) {
				const matcher = matchers[index];
				text = matcher.replaceMid(text, needTo, replaceTo);
			}
		} else {
			text = text.replace(new RegExp(group1 + needTo + group2,'g'), `$1${replaceTo}$3`);
		}
		this.text = text;
	}
}