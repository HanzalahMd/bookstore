const express = require('express')
const hbs = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

const app = express()

app.engine('hbs', hbs({defaultLayout: 'default.hbs'}))
app.set('view engine', 'hbs')

const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;
const URL = 'https://api.nytimes.com/svc/books/v3/reviews.json'
const API_KEY = 'HXnPmsDAUt4y8JqwLdbzIMgE2YFSecTG' //process.env.API_KEY

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.BD_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: 'hanzo', //process.env.DB_USER,
    password: 'hanzo', //process.env.DB_PWD
    connectionLimit: 4
})

const startApp = async (app, pool) =>{

    try {
        // acquire a connection from the connection pool
        const conn = await pool.getConnection();

        console.log('Pinging database...')
        await conn.ping()

        // release the connection
        conn.release()

        app.listen(PORT, ()=>{
            console.log(`The server is running on port: ${PORT} - ${new Date}`);
        })

    } catch(e) {
        console.error('cannot ping database: ', e)
    }
}

//SQL
const SQL_GET_LIST_TITLE = 'select * from book2018 where title like ? limit 10 offset ?'
const SQL_GET_BOOK_BY_BOOKID = 'select * from book2018 where book_id = ?'
const SQL_GET_COUNT_BY_FIRST_CHAR = 'select count(*) as count from book2018 where title like ?'

const letterArr = 'abcdefghijklmnopqrstuvwxyz'.split('');
const numArr = '0123456789'.split('');

app.get('/', (req, res)=>{
    res.status(200);
    res.type('text/html');
    res.render('main', {
        letterArr,
        numArr
    })
})

app.get('/books/review', async (req,res)=>{
    //console.log(req.query);
    const search = req.query.search;

    const full_url = withQuery(URL,
        {
            title: search,
            'api-key': API_KEY
        })

    // console.log(full_url);

    const result = await fetch (full_url);
    const reviews = await result.json();

    console.log(reviews);

    const displayReviews = reviews.results.map(
        (d) => {
            return { title: d.book_title, author: d.book_author, reviewer: d.byline, date: d.publication_dt, summary: d.summary, url: d.url,}
        }
    )

    console.log(displayReviews);


    res.status(200);
    res.type('text/html');
    res.render('review', {
        displayReviews,
        copy: reviews.copyright,
        hasContent: displayReviews.length > 0
    })
})

app.get('/:getChar/:pageNum/:book_id', async (req, resp) => {
    const book_id = req.params['book_id']

    const conn = await pool.getConnection()

    try {
        const results = await conn.query(SQL_GET_BOOK_BY_BOOKID, [ book_id ])
        const recs = results[0]

        if (recs.length <= 0) {
            //404!
            resp.status(404)
            resp.type('text/html')
            resp.send(`Not found: ${book_id}`)
            return
        }

        resp.status(200)
        resp.format({
            'text/html': () => {
                resp.type('text/html')
                resp.render('book', { book: recs[0] })
            },
            'application/json': () => {
                resp.type('application/json')
                resp.json(recs[0])
            },
            'default': () => {
                resp.type('text/plain')
                resp.send(JSON.stringify(recs[0]))
            }
        })

    } catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))
    } finally {
        conn.release()
    }
})


app.get('/:getChar/:pageNum', async (req, res)=>{

    const q = req.query.q;

    const searchChar = req.params.getChar
    const pageNum = parseInt(req.params.pageNum)
    const prevPageNum = pageNum - 1
    const nextPageNum = pageNum + 1
    const offset = (pageNum - 1) * 10
    const conn = await pool.getConnection();

    try {
        const countResult = await conn.query(SQL_GET_COUNT_BY_FIRST_CHAR, `${searchChar.toLowerCase()}%`)
        const count = parseInt(countResult[0][0].count)
        const totalPages = Math.ceil(count/10)
        let hasNextPage = true
        let hasPrevPage = true
        if(pageNum == 1) {
            hasPrevPage = false
        }
        if((pageNum == totalPages) || totalPages == 0) {
            hasNextPage = false
        }

        const result = await conn.query(SQL_GET_LIST_TITLE, [ `${q}%`, 10 ])
        //console.log(result)
        const records = result[0]

        //console.log(records);

        res.status(200);
        res.type('text/html');
        res.render('catalogue', {
            display: records,
            search: q,
            searchChar,
            pageNum,
            hasNextPage,
            hasPrevPage,
            prevPageNum,
            nextPageNum
        });

    } catch(e) {
    } finally {
        // release the connection
        conn.release()
    }
})


app.use(
    express.static(__dirname + '/public')
)


startApp(app, pool);