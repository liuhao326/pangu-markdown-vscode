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
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pangu-markdown-vscode" is now active!');
	let format = vscode.commands.registerCommand('pangu-markdown-vscode.formatPangu', () => {
		new PanguFormatter().updateDocument();
	});
	context.subscriptions.push(format);
	context.subscriptions.push(new Watcher());
}
exports.activate = activate;

// 方法去激活时调用的函数
function deactivate() { }

module.exports = {
	activate,
	deactivate
};

class PanguFormatter {
	constructor() {
		this.config = vscode.workspace.getConfiguration('pangu-markdown-vscode')
		this.CJK = '\\u2e80-\\u2eff\\u2f00-\\u2fdf\\u3040-\\u309f\\u30a0-\\u30fa\\u30fc-\\u30ff\\u3100-\\u312f\\u3200-\\u32ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
	};

	// 获取可编辑文档的全部内容
	getRange(doc) {
		let start = new vscode.Position(0, 0);
		let end = new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
		let range = new vscode.Range(start, end);
		return range;
	};

	updateDocument() {
		/*
		!======思路======
		?HTML及极端情况暂时不考虑
		1. 全局操作
			1.1 删除多余的换行//?（指南未提到，不排除刻意空行，应默认关闭）
			1.2 数字使用半角字符
			1.3 英文使用半角字符//?（指南未提到，不排除刻意使用全角，应默认关闭）
		2. 逐行处理
			!==空格==
			2.1 中英文之间、中文与数字之间添加空格//?（使用类及类的继承来解决元字符问题）
				2.1.1 "豆瓣FM"等专有名词，按官方所定义的格式书写；数字与单位（°和%等符号除外）之间需要增加空格//?（暂定为提示）
			2.2 链接之间增加空格//?（争议项，应默认关闭）
			2.3 全角标点与其他字符之间不加空格
			!==标点符号==
			2.4 不重复使用标点符号（？！、！？等算一个符号）
			2.5 使用全角中文标点
			2.6 遇到完整的英文整句、特殊名词，其内容使用半角标点
			2.7 简体中文使用直角引号//?（争议项，应默认关闭）
			!==名词==
			2.7 专有名词使用正确的大小写、且不要使用不地道的缩写//?（暂定为提示）
		*/
		let doc = vscode.window.activeTextEditor.document;
		if (doc.languageId === "markdown") {
			vscode.window.activeTextEditor.edit((editorBuilder) => {
				let text = doc.getText(this.getRange(doc));

				/* 全局替换 */
				// 删除多余的换行
				text = this.condenseContent(text);
				// 全角数字 ——> 半角数字
				text = this.replaceFullNums(text);
				// 全角英文 ——> 半角英文
				text = this.replaceFullChars(text);

				/* 逐行处理 */
				text = text.split("\n").map((line) => {
					// 处理标点
					line = this.replacePunctuations(line);
					// 删除多余的空格
					line = this.deleteSpaces(line);
					// 插入必要的空格
					line = this.insertSpace(line);
					return line;
				}).join("\n");

				properNounsAndAbbreviations();

				editorBuilder.replace(this.getRange(doc), text);
			});
		} else {
			vscode.window.showInformationMessage('不能处理非 Markdown 格式的文件。');
		};
	};

	/* 全角标点与其他字符之间不加空格 */
	deleteSpaces(text) {
		//全角标点与其他字符之间
		fullwidthPunctuations = "，。、《》？『』「」；∶【】｛｝—！＠￥％…（）"
		text = text.replace(new RegExp("(\s*)([{punctuations}])(\s*)".replace(/\{punctuations\}/g, fullwidthPunctuations), "g"), '$2')
		// 去掉「`()[]{}<>'"`」: 前后多余的空格
		text = text.replace(/\s+([\(\)\[\]\{\}<>'":])\s+/g, ' $1 ');

		// 去掉连续括号增加的空格，例如：「` ( [ { <  > } ] ) `」
		text = text.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
		text = text.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
		text = text.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
		text = text.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
		text = text.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
		text = text.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
		text = text.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
		text = text.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");

		// 去掉 「`$ () $`」, 「`$ [] $`」, 「`$ {} $`」 里面增加的空格
		// 去掉开始 $ 后面增加的空格，结束 $ 前面增加的空格
		// 去掉包裹代码的符号里面增加的空格
		// 去掉开始 ` 后面增加的空格，结束 ` 前面增加的空格
		text = text.replace(/([`\$])\s*([<\(\[\{])([^\$]*)\s*([`\$])/g, "$1$2$3$4");
		text = text.replace(/([`\$])\s*([^\$]*)([>\)\]\}])\s*([`\$])/g, "$1$2$3$4");

		// 去掉「`) _`」、「`) ^`」增加的空格
		text = text.replace(/\)\s([_\^])/g, ")$1");

		// 去掉 [^footnote,2002] 中的空格
		text = text.replace(/\[\s*\^([^\]\s]*)\s*\]/g, "[^$1]");

		// 将链接的格式中文括号“[]（）”改成英文括号“[]()”，去掉增加的空格
		text = text.replace(/\s*\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）]\s*/g, " [$1]($2) ");

		// 将图片链接的格式中的多余空格“! []()”去掉，变成“![]()”
		text = text.replace(/!\s*\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）]\s*/g, "![$1]($2) ");

		// 将网络地址中“ : // ”符号改成“://”
		text = text.replace(/\s*:\s*\/\s*\/\s*/g, "://");

		// 去掉行末空格
		text = text.replace(/(\S*)\s*$/g, '$1');

		// 去掉「123 °」和 「15 %」中的空格
		text = text.replace(/([0-9])\s*([°%])/g, '$1$2');

		// 去掉 2020 - 04 - 20, 08 : 00 : 00 这种日期时间表示的数字内的空格
		text = text.replace(/([0-9])\s*-\s*([0-9])/g, "$1-$2");
		text = text.replace(/([0-9])\s*:\s*([0-9])/g, "$1:$2");

		// 去掉 1 , 234 , 567 这种千分位表示的数字内的空格
		text = text.replace(/([0-9])\s*,\s*([0-9])/g, "$1,$2");

		// 全角標點與其他字符之間不加空格
		// 将无序列表的-后面的空格保留
		// 将有序列表的-后面的空格保留
		text = text.replace(/^(?<![-|\d.]\s*)\s*([，。、《》？『』「」；∶【】｛｝—！＠￥％…（）])\s*/g, "$1");
		return text;
	};

	/* 
	中英文之间（「豆瓣FM」等产品名词，按照官方所定义的格式书写）；
	中文与数字之间；
	数字与单位之间（度 / 百分比与数字之间不需要增加空格。）；
	链接之间增加空格（争议） */
	insertSpace(text) {
		// 在中文与英文、中文与数字、中文与`之间加入空格
		let CJK = this.CJK
		text = text.replace(new RegExp("([{CJK}])([a-zA-Z0-9`])".replace(/\{CJK\}/g, CJK), "g"), '$1 $2');
		// 在中文与英文、中文与数字、中文与`之间加入空格（考虑星号）
		text = text.replace(new RegExp("([a-zA-Z0-9`])([*]*[{CJK}])".replace(/\{CJK\}/g, CJK), "g"), "$1 $2");

		// 在单位之间加入空格
		console.log("如果文档中存在用英文表示的单位，请自行在数字与单位之间添加空格（例外：度/百分比与数字之间不需要增加空格）。");

		// 在 「I said:it's a good news」的冒号与英文之间加入空格 「I said: it's a good news」
		text = text.replace(/([:])\s*([a-zA-z])/g, "$1 $2");

		//链接之间增加空格

		return text;
	};

	/* 删除多余空行；tabs ——> 四个空格 */
	condenseContent(text) {
		// 制表符 ——> 四个空格
		let config = this.config
		if (config.get('covert_tabs_to_whitespace')) {
			text = text.replace(/\t/g, "    ");
		}
		// 删除超过2个的回车
		// Unix 的只有 LF，Windows 的需要 CR LF
		if (config.get('delete_extra_blank_lines')) {
			text = text.replace(/(\n){3,}/g, "$1$1");
			text = text.replace(/(\r\n){3,}/g, "$1$1");
			//删除文档结尾处多余的换行
			text = text.replace(/(\n){1,}$/g, '');
			text = text.replace(/(\r\n){1,}$/g, '');
		}
		return text;
	};

	/* 
	使用全角中文标点；
	遇到完整的英文整句、特殊名词，其内容使用半角标点;
	简体中文使用直角引号（争议）；
	不重复使用标点符号；
	*/
	replacePunctuations(text) {
		/* 思路：转换必定要转为全角标点的半角标点 ——> 处理连续标点 ——> 引号转为直角引号 ——> 打印提示，使用者手动检查需要转为半角的全角及需要转为全角的半角标点 */

		// 中文结尾处的半角标点 ——> 全角标点
		let CJK = this.CJK
		text = text.replace(new RegExp("([{CJK}])\\.([{CJK}A-Za-z0-9])".replace(/\{CJK\}/g, CJK), "g"), '$1。$2');// .——>。
		text = text.replace(new RegExp("([{CJK}]),".replace("{CJK}", CJK), "g"), '$1，');// ,——>，
		text = text.replace(new RegExp("([{CJK}]);".replace("{CJK}", CJK), "g"), '$1；');// ;——>；
		text = text.replace(new RegExp("([{CJK}])!".replace("{CJK}", CJK), "g"), '$1！');// \!——>！
		text = text.replace(new RegExp("([{CJK}])\?".replace("{CJK}", CJK), "g"), '$1？');// \?——>？
		text = text.replace(new RegExp("([{CJK}])\:".replace("{CJK}", CJK), "g"), '$1：');// :——>：
		text = text.replace(new RegExp("(\")([{CJK}]*)(\")".replace("{CJK}", CJK), "g"), '“$2”');// "" ——> “”
		text = text.replace(new RegExp("[^\\]](\\()([{CJK}]*)(\\))".replace("{CJK}", CJK), "g"), '（$2）');// () ——> （）

		// 连续三个以上的句号 ——> ......
		text = text.replace(/(。|\.){3,}/g, '......');
		// 多个标点符号 ——> 一个标点符号（！？及？！算一个）
		text = text.replace(/(！？|？！|[！？。，；：、“”「」『』〖〗《》【】])(\1|[！？。，；：、“”「」『』〖〗《》【】]){1,}/g, '$1');

		let config = this.config
		if (config.get('covert_Chinese_quotations')) {
			// 中文引号 ——> 直角引号
			text = text.replace(/‘/g, "『");
			text = text.replace(/’/g, "』");
			text = text.replace(/“/g, "「");
			text = text.replace(/”/g, "」");
		}
		if(config.get('covert_English_quotations')){
			// 英文引号 ——> 直角引号
			text = text.replace(/(")([^"]*)(")/g, "「$2」")
			text = text.replace(/(')([^']*)(')/g, "『$2』")
		}

		/* 完整的英文整句、特殊名词，其内容使用半角标点 */
		//TODO：实现替换对应字符而不需要自己输入
		console.log("标点替换结束，下列操作需手动完成：")
		console.log("1. 完整的英文整句、特殊名词，其内容建议使用半角标点。请在编辑器中开启搜索并手动输入正则匹配检查英文或数字周围的标点是否正确：(\\w+)")
		console.log("2. 除 1 中指出的位置及 Markdown 标记需使用半角标点以外，其他位置建议使用全角标点。请在编辑器中开启搜索并手动输入正则匹配检查半角标点是否应该转为全角标点：[\\?~:!,\\.'\"\\-;\\(\\)\\[\\]\\{\\}]")

		return text;
	};

	/* 全角数字 ——> 半角数字 */
	replaceFullNums(text) {
		let config = this.config
		if(config.get('convert_fullwidthNums')){
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
		if(config.get('convert_fullwidthChars')){
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
		console.log("如果文档中存在专有名词，请自行确认其大小写正确且没有使用不地道的缩写。")
	}
};

class Watcher {
	getConfig() {
		this._config = vscode.workspace.getConfiguration('pangu-markdown-vscode');
	};
	constructor() {
		this.getConfig();
		if (this._config.get('auto_format_on_save', false)) {
			let subscriptions = [];
			this._disposable = vscode.Disposable.from(...subscriptions);
			vscode.workspace.onWillSaveTextDocument(this._onWillSaveDoc, this, subscriptions);
		};
	};
	dispose() {
		this._disposable.dispose();
	};
	_onWillSaveDoc(e) {
		new PanguFormatter().updateDocument();
	};
};