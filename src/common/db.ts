import { NowRequest, NowResponse } from '@vercel/node';
import sql from 'mssql';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

const config: sql.config = {
  server: '109.203.112.112',
  database: 'cir126_cirec',
  user: 'and_cirec',
  password: '78ati!8E3',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export async function executeQuery<T = any>(
  query: string,
  params?: { [key: string]: any }
): Promise<sql.IResult<T>> {
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  try {
    const request = pool.request();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
      });
    }

    return await request.query(query);
  } finally {
    await pool.close();
  }
}

export default async (req: NowRequest, res: NowResponse) => {
  const { key: findWord, page = 1, cb1 = false } = req.query;
  const pageSize = 20;
  const offset = (Number(page) - 1) * pageSize;

  try {
    const cacheKey = `search:${findWord}:${page}:${cb1}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return res.status(200).json(cachedResult);
    }

    const sanitizedWord = (findWord as string).replace(/[&<>"']/g, "");

    const countQuery = `
      SELECT COUNT(*) AS totalCount 
      FROM and_cirec.cr_articles 
      WHERE ${cb1 ? 'CONTAINS((ar_title, ar_content), @keyword)' : 'ar_title LIKE @keyword OR ar_content LIKE @keyword'}
    `;

    const countResult = await executeQuery(countQuery, {
      keyword: cb1 ? `"${sanitizedWord}"` : `%${sanitizedWord}%`,
    });
    const totalArticles = countResult.recordset[0].totalCount;

    const searchQuery = `
      SELECT 
        ar_id, 
        ar_title, 
        ar_datetime
      FROM and_cirec.cr_articles
      WHERE ${cb1 ? 'CONTAINS((ar_title, ar_content), @keyword)' : 'ar_title LIKE @keyword OR ar_content LIKE @keyword'}
      ORDER BY ar_datetime DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const articlesResult = await executeQuery(searchQuery, {
      keyword: cb1 ? `"${sanitizedWord}"` : `%${sanitizedWord}%`,
      offset,
      pageSize,
    });

    const result = {
      success: totalArticles > 0,
      totalArticles,
      articles: articlesResult.recordset,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalArticles / pageSize),
        pageSize,
      },
    };

    cache.set(cacheKey, result);

    res.status(200).json(result);
  } catch (error) {
    console.error("Search process failed:", error);
    res.status(500).json({ success: false, message: "Search process failed" });
  }
};
