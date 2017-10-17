import { ExtensionContext, DecorationRenderOptions, OverviewRulerLane, DecorationRangeBehavior, TextEditorDecorationType, window, workspace, DecorationOptions, Position, MarkdownString, Range, StatusBarItem, StatusBarAlignment, commands, Selection, TextEditor, languages, DocumentSelector, DocumentFilter } from 'vscode';

/**
 * Individual writerecord definition
 */
interface WriteRecord {
	name: string,
	startPos: number,
	endPos: number,
	length: number,
	justification?: "LEFT" | "RIGHT",
	description: string
}

let langStrings: string[] = <string[]>workspace.getConfiguration("columnHighLighter").get('languages');
var supportedLanguages: DocumentFilter[] = [];
langStrings.forEach(lang => {
	let selector: DocumentFilter = {
		language: lang
	}
	supportedLanguages.push(selector);
});

export function activate(context: ExtensionContext) {
	//Getting the columns information from settings
	var records = <WriteRecord[]>workspace.getConfiguration("columnHighLighter").get("columns");
	//Creating status bar
	const status = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	status.command = 'columnHighLighter.statusBarInfo';
	context.subscriptions.push(status);
	context.subscriptions.push(window.onDidChangeTextEditorSelection(e => updateStatus(status, records)));
	context.subscriptions.push(commands.registerCommand('columnHighLighter.statusBarInfo', () => {
		selectField(records);
	}));

	updateStatus(status, records);
	
	/**Generation color looping though the color list defined inside.*/
	function* getColor() {
		const colors = <string[]>workspace.getConfiguration("columnHighLighter").get("colors");
		let currentPos = 0;
		while (true) {
			if (currentPos > colors.length - 1) {
				currentPos = 0;
			}
			yield colors[currentPos];
			currentPos++;
		}
	}

	/** Style defined for the cells */
	const columnDecoratorOptions: DecorationRenderOptions = {
		borderWidth: '1px',
		borderStyle: 'solid',
		borderColor: 'black',
		rangeBehavior: DecorationRangeBehavior.ClosedClosed,
		backgroundColor: 'rgba(100,200,50, .3)'
	}
	
	/**
	 * Generates actual style object for each columns defined, and stores them in the {columnDecorationsArray}
	 */
	let colorGenerator = getColor();
	const columnDecorationTypes: TextEditorDecorationType[] = [];
	records.forEach(record => {
		columnDecoratorOptions.backgroundColor = colorGenerator.next().value;
		columnDecorationTypes.push(
			window.createTextEditorDecorationType(columnDecoratorOptions)
		);
	});


	const hoverMessages: MarkdownString[] = [];
	for (let record of records) {
		let msg: MarkdownString = new MarkdownString(record.name + '  \n' + (record.length) + '(' + record.startPos + ',' + record.endPos + ')  \n' + record.description);
		hoverMessages.push(msg);
	}

	//Triggers for first time
	let activeEditor = window.activeTextEditor;
	if (activeEditor) {
		triggerUpdateDecorations();
		var languageID = activeEditor.document.languageId;
	}

	//Triggers when switches to another tab or another file open etc.
	window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	/***
	 * Triggers when detects any changes to the text, eg: typeing any character
	 * Adjust the timeout function's time based on your editor's performance.
	 */
	workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	var timeout = null;
	function triggerUpdateDecorations() {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(updateDecorations, 100);
	}


	// workspace.onDidChangeTextDocument(textDocumentChangedEvent => {
	// 	columnDecorationTypes.forEach(col => {
	// 		col.dispose();
	// 	});
	// });
	/**
	 * Actual work begins here. Called after every changes made. 
	 * But in between each interval defined in the timeout function above
	 * 
	 * Iterates through each line and applyes format defined in the @columnDecorationsArray
	 * based on the range defined in the @records {Array} in write_record_entries.ts file.
	 */
	function updateDecorations() {
		if (!isSupported()) {
			return;
		}

		let formattedColumns: DecorationOptions[][] = [];
		for (let line = 0; line < activeEditor.document.lineCount; line++) {
			for (let record in records) {
				if (records[record].startPos > activeEditor.document.lineAt(line).text.length) {
					break;
				}

				if (!formattedColumns[record]) {
					formattedColumns[record] = [];
				}

				let startPos = new Position(line, records[record].startPos - 1);
				let endPos = new Position(line, (records[record].startPos - 1) + records[record].length);
				let decoration = { range: new Range(startPos, endPos), hoverMessage: hoverMessages[record] };

				formattedColumns[record].push(decoration);

			}
		}

		for (let i in records) {
			if (formattedColumns[i]) {
				activeEditor.setDecorations(columnDecorationTypes[i], formattedColumns[i]);
			}
		}

	}
}


function updateStatus(status: StatusBarItem, records: WriteRecord[]): void {
	let text = getWriteRecordInfo(records);
	if (text) {
		status.text = '$(repo-pull) ' + text;
	}

	if (text) {
		status.show();
	} else {
		status.hide();
	}
}


function getWriteRecordInfo(records: WriteRecord[]): string {
	const editor = window.activeTextEditor;
	let text: string;

	if (isSupported()) {
		let curPos = editor.selection.active.character;
		for (let record of records) {
			if (curPos >= record.startPos - 1 && curPos <= record.endPos - 1) {
				text = "Record: " + record.name + " | " + record.length + "(" + record.startPos + "," + record.endPos + ") | " + record.description;
				break;
			}
		}
	}
	return text;
}


function selectField(records: WriteRecord[]) {
	if (isSupported() && window.activeTextEditor.selection) {
		let curPos = window.activeTextEditor.selection;
		for (let record of records) {
			if (curPos.active.character >= record.startPos - 1 && curPos.active.character <= record.endPos - 1) {
				let select: Selection = new Selection(new Position(curPos.active.line, record.startPos - 1),
					new Position(curPos.active.line, record.startPos + record.length - 1));
				window.activeTextEditor.selection = select;
				break;
			}
		}
	}
}

function isSupported(): boolean {
	if (!window.activeTextEditor)
		return false;

	if (languages.match(supportedLanguages, window.activeTextEditor.document) != 0) {
		return true;
	}

	return false;
}