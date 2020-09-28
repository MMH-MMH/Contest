const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const User = require('../models/user');
const Ques = require('../models/ques');
const Submission = require('../models/submission');
const Contest = require('../models/contest');
const { exec } = require("child_process");
const isAuthenticated = require('./users');
const notifier = require('node-notifier');
const { c, cpp, node, python, java } = require('compile-run');
var fs = require('fs');
const qrate = require('qrate');
const { stderr } = require('process');
const { all } = require('./users');
const q = require('../judge');
const { google } = require('googleapis');
const drive = google.drive('v3');
const stream = require('stream');
const cred = require('../config/cred');


var app = express();
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



var contestSchema = new Contest;
var allcontest = {};
contestSchema.score = {};

let probs = {};



router.route('/')
    .get(async(req, res) => {

        await Contest.find({ 'done': false }, 'name code problems date duration done', (err, due) => {
            if (err) throw err;

            if (due) {
                allcontest = due;

            }
        });

        var crname = [],
            crcode = [],
            crdate = [],
            cename = [],
            cecode = [],
            cedate = [],
            cuname = [],
            cucode = [],
            cudate = [],
            now = Date.now();

        for (let i = 0; i < allcontest.length; i++) {
            var date = allcontest[i].date.getTime(),
                dur = allcontest[i].duration;
            if (now >= date && (date + (dur * 60 * 60 * 1000)) >= now) {
                crname.push(allcontest[i].name);
                crcode.push(allcontest[i].code);
                crdate.push(allcontest[i].date);
            } else if ((date + dur * 60 * 60 * 1000) < now) {
                cename.push(allcontest[i].name);
                cecode.push(allcontest[i].code);
                cedate.push(allcontest[i].date);
            } else {
                cuname.push(allcontest[i].name);
                cucode.push(allcontest[i].code);
                cudate.push(allcontest[i].date);
            }
        }


        res.render('contests', {
            CRName: crname,
            CRCode: crcode,
            CRDate: crdate,
            CEName: cename,
            CECode: cecode,
            CEDate: cedate,
            CUName: cuname,
            CUCode: cucode,
            CUDate: cudate,
        });
    })

.post((req, res) => {
    var obj = req.body;

    var contestname = Object.keys(obj)[0];
    Contest.find({ 'name': contestname }, (err, res) => {

        contestSchema = res[0];
    })
    res.redirect('/contests/quespage');
})

var probAccCode = probs;

router.route('/quespage')

.get(async(req, res) => {
        var date;
        var dur = contestSchema.duration;
        var pC = [];
        await Contest.findOne({ 'code': contestSchema.code }, 'date duration problems', (err, res) => {
            if (err) throw err;
            date = res.date.getTime();
            dur = res.duration;
            for (let i = 0; i < res.problems.length; i++) {
                pC.push(res.problems[i]);
            }
        })

        var now = Date.now();
        console.log("pc -- ", pC);
        if (now >= date && (date + (dur * 60 * 60 * 1000)) >= now) {
            res.render('quespage', {
                CName: contestSchema.name,
                CCode: contestSchema.code,
                CProblems: pC,
                pt: "Problems",
                CStatus: "Contest is running",
            });
        } else if ((date + dur * 60 * 60 * 1000) < now) {

            res.render('quespage', {
                CName: contestSchema.name,
                CCode: contestSchema.code,
                CProblems: pC,
                pt: "Problems",
                CStatus: "Contest ended",
            });
        } else {
            res.render('quespage', {
                CName: contestSchema.name,
                CCode: contestSchema.code,
                CProblems: [],
                pt: "Problems will be available soon",
                CStatus: "Contest is not yet started",
            });
        }
    })
    // .post(async(req, res, next) => {
    //     try {
    //         var url = req.body;

//         var que = Object.keys(url)[0];

//         res.redirect('/contests/ranklist' + que);
//     } catch (error) {
//         next(error);
//     }
// });


router.route('/quespage/prob/:probCode')

.get(async(req, res) => {

    var final1 = {},
        code = req.params.probCode;

    await Ques.findOne({ 'probCode': code }, 'probCode probSetter asked probTester dateAdded tl ml numofinputfiles score', (err, res) => {
        if (err) throw err;
        final1 = res;
    });
    final1.statement = fs.readFileSync(__dirname + "/" + code + "/" + code + "s.txt", 'utf-8');
    final1.input = fs.readFileSync(__dirname + "/" + code + "/" + code + "i.txt", 'utf-8');
    final1.output = fs.readFileSync(__dirname + "/" + code + "/" + code + "o.txt", 'utf-8');

    // console.log("final -- ", final1);

    res.render('prob', {
        CPText: final1.statement,

        CPCode: final1.probCode,
        CPSetter: final1.probSetter,
        CPTester: final1.probTester,
        CPDate: final1.dateAdded,
        CPInput: final1.input,
        CPOutput: final1.output,
        TL: final1.tl,
        ML: final1.ml,
        Score: final1.score,
    })
})

.post(async(req, res, next) => {
    try {
        res.redirect('/contests/submit/' + req.params.probCode);
    } catch (error) {
        next(error);
    }

});

router.route('/submit/:probCode')

.get((req, res) => {
    res.render('submit');

})

.post(isAuthenticated, async(req, res, next) => {

    try {

        subdate = Date().split("GMT")[0];
        subdatestring = Date.now().toString();
        // console.log("Date -- ", subdatestring);

        req["submitTime"] = new Date().getTime();

        var reqbody = {};

        reqbody = req.body;

        Object.setPrototypeOf(reqbody, Object);

        if (req.user == undefined) {
            req.user = {};
            req.user.username = "none";
        }

        var sub = new Submission();
        const uCode = ((reqbody.code).toString());
        var prC = req.params.probCode;
        sub.s_id = prC + req.user.username + subdatestring.trim();
        sub.ccode = contestSchema.code;
        sub.code = uCode;
        sub.language = reqbody.lang;
        sub.who = req.user.username;
        sub.when = req.submitTime;
        sub.which = prC;
        sub.time = 0;
        sub.memory = 0;
        sub.verdict = "Compiling";

        await sub.save();

        var date, now = Date.now();
        var dur = contestSchema.duration;

        await Contest.findOne({ 'code': contestSchema.code }, 'date duration', (err, res) => {
            if (err) throw err;
            date = res.date.getTime();
            dur = res.duration;

        })
        if (now >= date && (date + (dur * 60 * 60 * 1000)) >= now) {

            fs.writeFileSync(__dirname + '/submissions/' + sub.s_id + ".cpp", sub.code, 'utf8', (err) => {
                if (err) throw err;
            })

            let bufst = new stream.PassThrough();



            var lang = sub.language;
            var command;
            if (lang === "C++") {
                command = "g++";
            }

            compilecommand = command + " " + __dirname + "/submissions/" + sub.s_id + ".cpp"

            exec(compilecommand, (err, stdout, stderr) => {
                if (err) {
                    console.log("Compile Error");
                    Submission.updateOne(sub, { $set: { 'verdict': "CE", 'time': 0, 'memory': 0 } }, (err, res) => {
                        if (err) throw err;
                    })
                } else {
                    console.log("Compile Success");
                    Submission.updateOne(sub, { $set: { 'verdict': "In queue", "time": 0, "memory": 0 } }, (err, res) => {
                        if (err) throw err;
                    })
                    var topush = { contestSchema, sub };

                    q.push(topush);
                    console.log("Queued");
                }
            })
            res.redirect("/contests/submissions/1");
        } else if ((date + (dur * 60 * 60 * 1000)) < now) {
            res.redirect("/contests/quespage");
            notifier.notify('Contest is ended');
            req.flash('error', "Contest is ended");

        } else {
            res.redirect("/contests/quespage");
            req.flash('error', "Contest is not yet started");
        }

    } catch (error) {
        next(error);
    }

});

router.route('/submissions/:page')
    .get(isAuthenticated, async(req, res) => {

        var subs = [];
        if (contestSchema.code === undefined) {
            await Submission.find({ 'who': req.user.username }, 's_id who when which verdict time memory', (err, res) => {
                if (err) throw err;

                var temp = {};

                for (let i = res.length - 1; i >= 0; i--) {
                    var obj = [];
                    obj.push(res[i].s_id);
                    obj.push(res[i].who);
                    obj.push(res[i].which);
                    obj.push(res[i].when);

                    obj.push(res[i].verdict);
                    obj.push(res[i].time);
                    obj.push(res[i].memory);
                    temp[res[i].when] = obj;
                }
                var temp1 = Object.keys(temp);


                for (let i = 0; i < temp1.length; i++) {
                    subs.push(temp[temp1[i]]);
                }

            });
        } else {
            await Submission.find({ 'who': req.user.username, 'ccode': contestSchema.code }, 's_id who when which verdict time memory', (err, res) => {
                if (err) throw err;

                var temp = {};

                for (let i = res.length - 1; i >= 0; i--) {
                    var obj = [];
                    obj.push(res[i].s_id);
                    obj.push(res[i].who);
                    obj.push(res[i].which);
                    obj.push(res[i].when);

                    obj.push(res[i].verdict);
                    obj.push(res[i].time);
                    obj.push(res[i].memory);
                    temp[res[i].when] = obj;
                }
                var temp1 = Object.keys(temp);


                for (let i = 0; i < temp1.length; i++) {
                    subs.push(temp[temp1[i]]);
                }

            });
        }


        var page = Number(req.params.page) || 1;
        var numofsubspage = 5;

        var last = Math.ceil(subs.length / (numofsubspage));
        var prev = Math.max(page - 1, 1);
        var next = Math.min(page + 1, last);

        var f = 1;
        var i1, i2;
        i1 = (Math.max((page - 1), 0) * (numofsubspage));
        i2 = i1 + numofsubspage;

        res.render('submissions', {
            subs: subs.slice(i1, i2),
            prev: prev,
            next: next,
            first: f,
            last: last,
            page: page,
            nos: numofsubspage,
        })

    });


router.route('/status/:page')
    .get(isAuthenticated, async(req, res) => {
        var subs = [];
        await Submission.find({}, 's_id who when which verdict time memory', (err, res) => {
            if (err) throw err;

            var temp = {};

            for (let i = res.length - 1; i >= 0; i--) {
                var obj = [];
                obj.push(res[i].s_id);
                obj.push(res[i].who);
                obj.push(res[i].which);
                obj.push(res[i].when);

                obj.push(res[i].verdict);
                obj.push(res[i].time);
                obj.push(res[i].memory);
                temp[res[i].when] = obj;
            }
            var temp1 = Object.keys(temp);

            for (let i = 0; i < temp1.length; i++) {

                subs.push(temp[temp1[i]]);
            }
        });


        var page = Number(req.params.page) || 1;
        var numofsubspage = 5;

        var last = Math.ceil(subs.length / (numofsubspage));
        var prev = Math.max(page - 1, 1);
        var next = Math.min(page + 1, last);

        var f = 1;
        var i1, i2;
        i1 = (Math.max((page - 1), 0) * (numofsubspage));
        i2 = i1 + numofsubspage;

        res.render('status', {
            subs: subs.slice(i1, i2),
            prev: prev,
            next: next,
            first: f,
            last: last,
            page: page,
            nos: numofsubspage,
        })
    });



router.route('/usersubmission/:s_id')
    .get(isAuthenticated, async(req, res) => {
        var s_id = req.params.s_id;
        var userdata;


        var code, codea = [];
        await Submission.findOne({ 's_id': s_id }, 'language ccode who when which verdict time memory', (err, res) => {
            if (err) throw err;
            userdata = res;
        });

        await Contest.find({ 'code': userdata.ccode }, 'date duration', (err, due) => {
            if (err) throw err;
            if (due) {
                allcontest = due;
            }
        });


        var now = Date.now(),
            date = allcontest.date,
            dur = allcontest.duration;


        if (req.user.username === userdata.who || (date + dur * 60 * 60 * 1000) < now) {
            code = fs.readFileSync(__dirname + '/submissions/' + s_id + '.cpp', 'utf-8').toString();
            // console.log(code);

            res.render('usersubmission', {
                code: code,
                who: userdata.who,
                which: userdata.which,
                language: userdata.language,
                verdict: userdata.verdict,
                memory: userdata.memory,
                time: userdata.time,
                when: userdata.when,
            })
        } else {
            res.render('usersubmission', {
                code: "Access Denied",
                who: "NaN",
                which: "NaN",
                language: "NaN",
                verdict: "NaN",
                memory: "NaN",
                time: "NaN",
                when: "NaN",
            })
        }

    })


router.route('/ranklist/:code')

.get(async(req, res) => {

    var currentuser = [],
        contest = {},
        code = req.params.code,
        scores = [],
        pC = [];

    await Contest.find({ 'code': code }, (err, res) => {
        pC = res[0].problems;


        if (res[0].score) {
            contest = res[0].score;

            if (req.isAuthenticated()) {
                if (contest[req.user.username] !== undefined) {
                    currentuser.push(req.user.username);
                    currentuser.push(contest[req.user.username]["score"]);
                }
            }

            Object.keys(contest).forEach(k => {
                var arr = [];
                arr.push(contest[k]["score"]);
                arr.push(contest[k]["penalty"]);
                arr.push(k);
                scores.push(arr);
            })
        }

    })
    var show = {};
    if (scores.length > 0) {

        scores.sort((a, b) => {
            if (a[0] < b[0]) return 1;
            else if (a[0] > b[0]) return -1;
            if (a[1] < b[1]) return -1;
            else if (a[1] > b[1]) return 1;
            if (a[2] < b[2]) return 1;
            else if (a[2] > b[2]) return -1;
        });

        for (let i = 0; i < scores.length; i++) {
            show[scores[i][2]] = contest[scores[i][2]];
            show[scores[i][2]]["problem"] = {};
            var pcodes = {};
            for (let j = 0; j < pC.length; j++) {
                pcodes[pC[j]] = '-';
            }
            Object.keys(contest[scores[i][2]]).forEach(k => {

                if (pcodes[k] === '-') {
                    if (contest[scores[i][2]][k]["p"] === undefined) {
                        contest[scores[i][2]][k]["p"] = 0;
                    }
                    pcodes[k] = {
                        "score": contest[scores[i][2]][k]["score"],
                        "p": contest[scores[i][2]][k]["p"]
                    }
                }

            })

            show[scores[i][2]]["problem"] = pcodes;
            show[scores[i][2]]["rank"] = i + 1;

        }
    }


    res.render('ranklist', {
        pC: pC,
        data: show,
        cuser: currentuser
    })
})


module.exports = router;