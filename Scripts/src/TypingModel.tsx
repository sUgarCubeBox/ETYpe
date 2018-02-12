﻿// A '.tsx' file enables JSX support in the TypeScript compiler, 
// for more information see the following page on the TypeScript wiki:
// https://github.com/Microsoft/TypeScript/wiki/JSX

import './SpanWindow';
import { Queue } from 'typescript-collections';
import { Observable, Subject } from 'rxjs/Rx';

export class Processor {
    private words: Array<Entry>; // immutable
    private wordIndex: number; // state
    private cursor: number; // state

    // subjects
    private missTypeSubject = new Subject<{}>();
    private correctTypeSubject = new Subject<{}>();
    private nextWordSubject = new Subject<{}>();
    private finishSubject = new Subject<{}>();
    private startSubject = new Subject<{}>();
    private skipSubject = new Subject<{}>();

    public MissAsObservable(): Observable<{}> { return this.missTypeSubject; }
    public CorrectAsObservable(): Observable<{}> { return this.correctTypeSubject; }
    public NextWordAsObservable(): Observable<{}> { return this.nextWordSubject; }
    public FinishAsObservable(): Observable<{}> { return this.finishSubject; }
    public StartAsObservable(): Observable<{}> { return this.startSubject; }
    public SkipAsObservable(): Observable<{}> { return this.skipSubject; }

    constructor(words: Array<Entry>) {
        this.cursor = 0;
        this.words = words;
        this.wordIndex = 0;
    }

    public Start() {
        this.cursor = 0;
        this.wordIndex = 0;
        this.startSubject.next({});
    }

    /// return true when typed letter is correct.
    public Enter(letter: string): boolean {
        var currentLetter: string = this.CurrentLetter;
        if (letter === currentLetter) {
            this.cursor++;
            this.correctTypeSubject.next({});
            if (this.IsEntered) {
                this.NextWord();
            }
            return true;
        } else {
            this.missTypeSubject.next({});
            return false;
        }
    }

    // use to time over or giveup
    public Skip() {
        this.skipSubject.next({});
        this.NextWord();
    }

    private NextWord() {
        this.wordIndex++;
        if (this.IsFinished) {
            this.finishSubject.next({});
            return;
        }
        this.cursor = 0;
        this.nextWordSubject.next({});
    }

    private get IsEntered(): boolean {
        return this.cursor <= this.CurrentWord.length;
    }

    private get IsFinished(): boolean {
        return this.words.length <= this.wordIndex;
    }

    private get CurrentWord(): string {
        return this.NowTypingEntry.Word;
    }

    private get CurrentLetter(): string {
        return this.CurrentWord.charAt(this.cursor);
    }

    public get Typed(): string {
        return this.CurrentWord.substr(0, this.cursor);
    }

    public get Left(): string {
        return this.CurrentWord.substr(this.cursor, this.CurrentWord.length);
    }

    public get NowTypingEntry(): Entry {
        return this.words[this.wordIndex];
    }

    public get NextTypingEntry(): Entry {
        var nextIndex = this.wordIndex + 1;
        return nextIndex < this.words.length ? this.words[nextIndex] : null;
    }

    public get Words(): Entry[] {
        return this.words;
    }

    public get Cursor(): number {
        return this.cursor;
    }

    public get WordIndex(): number {
        return this.wordIndex;
    }
}

export class Entry {

    private word: string;
    private mean: string;

    public get Word(): string { return this.word; }
    public get Mean(): string { return this.mean; }

    constructor(word: string, mean: string) {
        this.word = word;
        this.mean = mean;
    }

    public static CreateFromJsonArray(jsonArrayStr: string): Array<Entry> {
        return JSON.parse(jsonArrayStr);
    }
}

export interface ITypingState {
    readonly missCount: number;
    readonly correctCount: number;
    readonly timeOverCount: number;
    readonly startTime: Date;
    readonly endTime: Date;
    readonly maxSpeed: number;
    readonly missTypedMap: number[][];
    readonly words: Entry[];
}

export class Watcher {
    private processor: Processor;
    private state: TypingState;

    public get State(): ITypingState { return this.state; }

    constructor(processor: Processor) {
        this.processor = processor;
        var state = new TypingState(this.processor.Words);
        this.state = state;
        this.Bind(this.processor, this.state);
    }

    private Bind(p: Processor, state: TypingState) {
        // start
        p.StartAsObservable().subscribe(x => state.startTime = new Date(Date.now()));
        p.CorrectAsObservable().subscribe(x => state.correctCount++);
        p.MissAsObservable().subscribe(x => state.missCount++);
        p.SkipAsObservable().subscribe(x => state.timeOverCount++);
        p.FinishAsObservable().subscribe(x => state.endTime = new Date(Date.now()));
        p.StartAsObservable().subscribe(x => this.BindMaxSpeedCalculation(p, state));
        p.StartAsObservable().subscribe(x => this.BindMissTypedRecording(p, state));        
    }

    private BindMaxSpeedCalculation(p: Processor, state: TypingState) {
        // calc max speed
        p.CorrectAsObservable()
            .map(x => Date.now())
            .map(x => [x, x]) // diagonal map
            .scan((prevPair, diagonalPair) => [prevPair[1], diagonalPair[0]], [0, 0])
            .map(x => x[1] - x[0]) // time between keydowns
            .spanWindow<number>(5) // buffering events by sliding window
            .map(x => x.reduce((s, x) => s + x) / x.length) // window average
            .scan((min, x) => x < min ? x : min, Number.MAX_VALUE)
            .distinctUntilChanged()
            .do(x => console.log(x))
            .subscribe(x => state.maxSpeed = 1000 / new Date(x).getMilliseconds()); 
    }

    private BindMissTypedRecording(p: Processor, state: TypingState) {
        p.MissAsObservable()
            .map(x => [p.Cursor, p.WordIndex])
            .subscribe(x => state.missTypedMap[x[1]][x[0]] += 1); // record misstyped position
    }
}

class TypingState implements ITypingState {
    missCount: number = 0;
    correctCount: number = 0;
    timeOverCount: number = 0;
    startTime: Date = null;
    endTime: Date = null;
    maxSpeed: number = 0;
    missTypedMap: number[][];
    words: Entry[];

    constructor(words: Entry[]) {
        this.missTypedMap = [];
        this.words.map(x => x.Word).forEach(x => {
            var t = new Array<number>(x.length);
            for (var i = 0; i < x.length; i++) // init 2 dims array with 0.
                t[i] = 0;
            this.missTypedMap.push();
        });
    }
}

class Rank {
    score: number;
    rank: string;
    constructor(score: number, rank: string) {
        this.score = score;
        this.rank = rank;
    }
}

/// スコアとかを集計する
export class TypingStateAggregater {
    private state: ITypingState;   

    constructor(state: ITypingState) {
        this.state = state;
    }

    public get State(): ITypingState { return this.state };

    public CalcSpan(): Date {
        var startTime = this.state.startTime.getTime();
        var endTime = this.state.endTime.getTime();
        return new Date(endTime - startTime);
    }

    public CalcWPM(): number {
        var spanTimeOfMinutes = this.CalcSpan().getTime() / (1000 * 60);
        var typed = this.state.correctCount;

        // [minute] = [millisecond] / (1000 * 60);
        return typed / spanTimeOfMinutes;
    };

    public CalcScore(): number{
        return this.CalcWPM() + this.state.maxSpeed * 1 - this.state.missCount * 5;
    }

    public CalcRank(): string {
        var score = this.CalcScore();
        var map: Rank[] = [
            new Rank(550, "神タイパー"),
            new Rank(400, "トップタイパー"),
            new Rank(300, "メジャータイパー"),
            new Rank(200, "デビュータイパー"),
            new Rank(100, "タイパー研究生")
        ];

        var rank = "ゲスト";
        map.forEach(r => {
            if (r.score <= score)
                rank = r.rank;
        });

        return rank;
    }
}
