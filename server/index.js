
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
}));
app.use(express.json());

// ==========================================
// 1. HEALTH CHECK
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database'
    );

    res.json({
      message: 'EventSphere backend is running',
      database: result.rows[0].database,
    });
  } catch (error) {
    
   console.error('Database health check failed:', {
  name: error.name,
  message: error.message,
  code: error.code,
  errors: error.errors?.map((e) => ({
    message: e.message,
    code: e.code,
    address: e.address,
    port: e.port,
  })),
});
    res.status(500).json({
      error: 'Database connection failed',
    });
  }
});


// ==========================================
// AUTHENTICATION: ADMIN LOGIN
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing from .env');
      return res.status(500).json({
        error: 'Authentication is not configured.',
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role
       FROM admin_users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    const admin = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      error: 'Login failed. Please try again.',
    });
  }
});


// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================





// Protect all API routes declared after this point.
app.use('/api', authenticateToken);

// ==========================================
// AUTHENTICATION: GET CURRENT ADMIN
// ==========================================

app.get('/api/auth/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role
       FROM admin_users
       WHERE id = $1`,
      [req.admin.id]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        error: 'Administrator account not found.',
      });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get admin error:', error.message);
    res.status(500).json({
      error: 'Could not retrieve administrator details.',
    });
  }
});

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Access denied. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        error: 'Administrator access required.',
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired session. Please log in again.',
    });
  }
}

// Protect all API routes declared after this point.
app.use('/api', authenticateToken);

// ==========================================
// AUTHENTICATION: GET CURRENT ADMIN
// ==========================================

app.get('/api/auth/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role
       FROM admin_users
       WHERE id = $1`,
      [req.admin.id]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        error: 'Administrator account not found.',
      });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get admin error:', error.message);
    res.status(500).json({
      error: 'Could not retrieve administrator details.',
    });
  }
});

// ==========================================
// 2. GET ALL EVENTS
// ==========================================

app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        COALESCE(b.planned_budget, 0) AS planned_budget,
        COALESCE(
          e.expected_attendees,
          r.registered_attendees,
          0
        ) AS expected_attendees,
        ev.venue_id AS venue_id,
        TO_CHAR(ev.booking_start, 'YYYY-MM-DD') AS booking_date,
        TO_CHAR(ev.booking_start, 'HH24:MI') AS start_time,
        TO_CHAR(ev.booking_end, 'HH24:MI') AS end_time,
        ev.booking_status AS booking_status
      FROM events e
      LEFT JOIN budgets b
        ON b.event_id = e.event_id
      LEFT JOIN (
        SELECT
          event_id,
          COUNT(DISTINCT attendee_id) AS registered_attendees
        FROM registrations
        GROUP BY event_id
      ) r
        ON r.event_id = e.event_id
      LEFT JOIN LATERAL (
        SELECT
          venue_id,
          booking_start,
          booking_end,
          booking_status
        FROM event_venues
        WHERE event_id = e.event_id
          AND booking_status = 'booked'
        ORDER BY booking_id DESC
        LIMIT 1
      ) ev ON TRUE
      ORDER BY e.event_id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch events error:', error.message);
    res.status(500).json({
      error: 'Could not fetch events',
    });
  }
});



// ==========================================
// 3. ADD EVENT
// ==========================================

app.post('/api/events', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      name,
      type,
      date,
      status,
      description,
      attendees,
      budget,
      venue_id,
      startTime = '09:00',
      endTime = '18:00',
    } = req.body;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      !type ||
      !date ||
      !status
    ) {
      return res.status(400).json({
        error: 'Name, type, date, and status are required.',
      });
    }

    const parsedAttendees =
      attendees === '' || attendees == null
        ? null
        : Number(attendees);

    const parsedBudget =
      budget === '' || budget == null
        ? null
        : Number(budget);

    if (
      parsedAttendees !== null &&
      (!Number.isInteger(parsedAttendees) || parsedAttendees < 0)
    ) {
      return res.status(400).json({
        error: 'Expected attendees must be a non-negative whole number.',
      });
    }

    if (
      parsedBudget !== null &&
      (!Number.isFinite(parsedBudget) || parsedBudget < 0)
    ) {
      return res.status(400).json({
        error: 'Budget must be a non-negative number.',
      });
    }

    const hasVenue = venue_id !== '' && venue_id != null;
    const parsedVenueId = hasVenue ? Number(venue_id) : null;

    if (
      hasVenue &&
      (!Number.isInteger(parsedVenueId) || parsedVenueId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid venue.' });
    }

    if (
      hasVenue &&
      (!/^\d{2}:\d{2}$/.test(startTime) ||
        !/^\d{2}:\d{2}$/.test(endTime) ||
        startTime >= endTime)
    ) {
      return res.status(400).json({
        error: 'Enter valid booking times; end time must be after start time.',
      });
    }

    await client.query('BEGIN');

    if (hasVenue) {
      const venueResult = await client.query(
        'SELECT capacity FROM venues WHERE venue_id = $1',
        [parsedVenueId]
      );

      if (venueResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected venue was not found.' });
      }

      if (
        parsedAttendees !== null &&
        parsedAttendees > Number(venueResult.rows[0].capacity)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Attendee count exceeds this venue's capacity of ${venueResult.rows[0].capacity}.`,
        });
      }

      const conflict = await client.query(
        `SELECT booking_id
         FROM event_venues
         WHERE venue_id = $1
           AND booking_status = 'booked'
           AND booking_start < ($2::date + $4::time)
           AND booking_end > ($2::date + $3::time)
         LIMIT 1`,
        [parsedVenueId, date, startTime, endTime]
      );

      if (conflict.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'This venue is already booked during that time. Choose another time or venue.',
        });
      }
    }

    const result = await client.query(
      `INSERT INTO events
        (event_name, event_type, start_date, end_date,
         status, description, expected_attendees)
       VALUES (
         $1, $2, $3::date,
         ($3::date + INTERVAL '1 day')::timestamp,
         $4, $5, $6
       )
       RETURNING *`,
      [
        name.trim(),
        type,
        date,
        status.toLowerCase(),
        description || '',
        parsedAttendees,
      ]
    );

    const newEvent = result.rows[0];

    if (parsedBudget !== null) {
      await client.query(
        `INSERT INTO budgets
          (event_id, planned_budget, sponsorship_revenue)
         VALUES ($1, $2, 0)`,
        [newEvent.event_id, parsedBudget]
      );
    }

    if (hasVenue) {
      await client.query(
        `INSERT INTO event_venues
          (event_id, venue_id, booking_start, booking_end, booking_status)
         VALUES (
           $1, $2,
           ($3::date + $4::time),
           ($3::date + $5::time),
           'booked'
         )`,
        [newEvent.event_id, parsedVenueId, date, startTime, endTime]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...newEvent,
      expected_attendees: parsedAttendees,
      planned_budget: parsedBudget ?? 0,
      venue_id: parsedVenueId,
      start_time: hasVenue ? startTime : null,
      end_time: hasVenue ? endTime : null,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add event error:', error.message);

    res.status(500).json({
      error: 'Could not add event.',
    });
  } finally {
    client.release();
  }
});


// ==========================================
// 4. EDIT EVENT
// ==========================================


 // ==========================================
 // 4. EDIT EVENT
 // ==========================================

app.put('/api/events/:id', async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const eventId = Number(req.params.id);

    const {
      name,
      type,
      date,
      status,
      description,
      attendees,
      budget,
      venue_id,
      startTime = '09:00',
      endTime = '18:00',
    } = req.body;

    if (
      !Number.isInteger(eventId) ||
      eventId <= 0 ||
      typeof name !== 'string' ||
      !name.trim() ||
      !type ||
      !date ||
      !status
    ) {
      return res.status(400).json({
        error: 'Valid event ID, name, type, date, and status are required.',
      });
    }

    const parsedAttendees =
      attendees === '' || attendees == null ? null : Number(attendees);

    const parsedBudget =
      budget === '' || budget == null ? null : Number(budget);

    if (
      parsedAttendees !== null &&
      (!Number.isInteger(parsedAttendees) || parsedAttendees < 0)
    ) {
      return res.status(400).json({
        error: 'Attendees must be a non-negative whole number.',
      });
    }

    if (
      parsedBudget !== null &&
      (!Number.isFinite(parsedBudget) || parsedBudget < 0)
    ) {
      return res.status(400).json({
        error: 'Budget must be a non-negative number.',
      });
    }

    const hasVenue = venue_id !== '' && venue_id != null;
    const parsedVenueId = hasVenue ? Number(venue_id) : null;

    if (
      hasVenue &&
      (!Number.isInteger(parsedVenueId) || parsedVenueId <= 0)
    ) {
      return res.status(400).json({
        error: 'Invalid venue.',
      });
    }

    if (
      hasVenue &&
      (
        !/^\d{2}:\d{2}$/.test(startTime) ||
        !/^\d{2}:\d{2}$/.test(endTime) ||
        startTime >= endTime
      )
    ) {
      return res.status(400).json({
        error: 'Enter valid booking times; end time must be after start time.',
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const existingEvent = await client.query(
      'SELECT event_id FROM events WHERE event_id = $1',
      [eventId]
    );

    if (existingEvent.rowCount === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(404).json({
        error: 'Event not found.',
      });
    }

    if (hasVenue) {
      const venueResult = await client.query(
        'SELECT capacity FROM venues WHERE venue_id = $1',
        [parsedVenueId]
      );

      if (venueResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(400).json({
          error: 'Selected venue was not found.',
        });
      }

      if (
        parsedAttendees !== null &&
        parsedAttendees > Number(venueResult.rows[0].capacity)
      ) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(400).json({
          error: `Attendee count exceeds this venue's capacity of ${venueResult.rows[0].capacity}.`,
        });
      }

      // Check for another event booking at the same venue and time.
      // Exclude the event currently being edited.
      const conflict = await client.query(
        `SELECT booking_id
         FROM event_venues
         WHERE venue_id = $1
           AND event_id <> $5
           AND booking_status = 'booked'
           AND booking_start < ($2::date + $4::time)
           AND booking_end > ($2::date + $3::time)
         LIMIT 1`,
        [parsedVenueId, date, startTime, endTime, eventId]
      );

      if (conflict.rowCount > 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;

        return res.status(409).json({
          error: 'This venue is already booked during that time. Choose another time or venue.',
        });
      }
    }

    // Save the exact date selected in the form.
    const result = await client.query(
      `UPDATE events
       SET event_name = $1,
           event_type = $2,
           start_date = $3::date,
           end_date = ($3::date + INTERVAL '1 day')::timestamp,
           status = $4,
           description = $5,
           expected_attendees = $6
       WHERE event_id = $7
       RETURNING *`,
      [
        name.trim(),
        type,
        date,
        status.toLowerCase(),
        description || '',
        parsedAttendees,
        eventId,
      ]
    );

    // Update the event's budget.
    if (parsedBudget === null) {
      await client.query(
        'DELETE FROM budgets WHERE event_id = $1',
        [eventId]
      );
    } else {
      const budgetResult = await client.query(
        `UPDATE budgets
         SET planned_budget = $1
         WHERE event_id = $2`,
        [parsedBudget, eventId]
      );

      if (budgetResult.rowCount === 0) {
        await client.query(
          `INSERT INTO budgets
           (event_id, planned_budget, sponsorship_revenue)
           VALUES ($1, $2, 0)`,
          [eventId, parsedBudget]
        );
      }
    }

    // Replace this event's venue booking with its updated booking.
    await client.query(
      'DELETE FROM event_venues WHERE event_id = $1',
      [eventId]
    );

    if (hasVenue) {
      await client.query(
        `INSERT INTO event_venues
         (event_id, venue_id, booking_start, booking_end, booking_status)
         VALUES (
           $1, $2,
           ($3::date + $4::time),
           ($3::date + $5::time),
           'booked'
         )`,
        [eventId, parsedVenueId, date, startTime, endTime]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      ...result.rows[0],
      expected_attendees: parsedAttendees,
      planned_budget: parsedBudget ?? 0,
      venue_id: parsedVenueId,
      start_time: hasVenue ? startTime : null,
      end_time: hasVenue ? endTime : null,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    console.error('Update event error:', error.message);

    res.status(500).json({
      error: 'Could not update event.',
    });
  } finally {
    client.release();
  }
});


// ==========================================
// 5. DELETE EVENT
// ==========================================
 
app.delete('/api/events/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({
        error: 'Invalid event ID.',
      });
    }

    await client.query('BEGIN');

    // Check whether the event exists
    const eventResult = await client.query(
      'SELECT * FROM events WHERE event_id = $1',
      [eventId]
    );

    if (eventResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Event not found.',
      });
    }

    // Delete records linked to this event first
    await client.query(
      'DELETE FROM event_resources WHERE event_id = $1',
      [eventId]
    );

    await client.query(
      'DELETE FROM event_vendors WHERE event_id = $1',
      [eventId]
    );

    await client.query(
      'DELETE FROM event_venues WHERE event_id = $1',
      [eventId]
    );

    await client.query(
      'DELETE FROM registrations WHERE event_id = $1',
      [eventId]
    );

    await client.query(
      'DELETE FROM expenses WHERE event_id = $1',
      [eventId]
    );

    await client.query(
      'DELETE FROM budgets WHERE event_id = $1',
      [eventId]
    );

    // Delete the event after its linked records
    await client.query(
      'DELETE FROM events WHERE event_id = $1',
      [eventId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Event and related records deleted successfully.',
      event: eventResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Delete event error:', error.message);

    res.status(500).json({
      error: 'Could not delete event. ' + error.message,
    });
  } finally {
    client.release();
  }
});


// ==========================================
// 6. GET ALL VENUES
// ==========================================
app.get('/api/venues', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM venues ORDER BY venue_id'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch venues error:', error.message);
    res.status(500).json({
      error: 'Could not fetch venues',
    });
  }
});


 // ==========================================
 // DASHBOARD STATISTICS
 // ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [
      eventsResult,
      upcomingResult,
      venuesResult,
      resourcesResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM events'),

      pool.query(`
        SELECT COUNT(*) AS total
        FROM events
        WHERE start_date >= CURRENT_DATE
      `),

      pool.query('SELECT COUNT(*) AS total FROM venues'),

      pool.query('SELECT COUNT(*) AS total FROM resources'),
    ]);

    res.json({
      totalEvents: Number(eventsResult.rows[0].total),
      upcomingEvents: Number(upcomingResult.rows[0].total),
      availableVenues: Number(venuesResult.rows[0].total),
      totalResources: Number(resourcesResult.rows[0].total),
    });
  } catch (error) {
    console.error('Dashboard statistics error:', error.message);
    res.status(500).json({
      error: 'Could not fetch dashboard statistics',
    });
  }
});


// ==========================================
// 7. ADD VENUE
// ==========================================
app.post('/api/venues', async (req, res) => {
  try {
    const {
      venue_name,
      location,
      capacity,
      rental_cost,
    } = req.body;

    if (
      typeof venue_name !== 'string' ||
      !venue_name.trim()
    ) {
      return res.status(400).json({
        error: 'Venue name is required.',
      });
    }

    const parsedCapacity =
      capacity === '' || capacity == null
        ? null
        : Number(capacity);

    const parsedRentalCost =
      rental_cost === '' || rental_cost == null
        ? null
        : Number(rental_cost);

    if (
      parsedCapacity !== null &&
      (!Number.isInteger(parsedCapacity) || parsedCapacity < 0)
    ) {
      return res.status(400).json({
        error: 'Capacity must be a non-negative whole number.',
      });
    }

    if (
      parsedRentalCost !== null &&
      (!Number.isFinite(parsedRentalCost) || parsedRentalCost < 0)
    ) {
      return res.status(400).json({
        error: 'Rental cost must be a non-negative number.',
      });
    }

    const result = await pool.query(
      `INSERT INTO venues
        (venue_name, location, capacity, rental_cost)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        venue_name.trim(),
        location || '',
        parsedCapacity,
        parsedRentalCost,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add venue error:', error);
    res.status(500).json({
      error: error.message,
    });
  }
});


 // ==========================================
 // 8. EDIT VENUE
 // ==========================================
app.put('/api/venues/:id', async (req, res) => {
  try {
    const venueId = Number(req.params.id);
    const { venue_name, location, capacity, rental_cost } = req.body;

    if (!Number.isInteger(venueId) || venueId <= 0) {
      return res.status(400).json({ error: 'Invalid venue ID.' });
    }

    if (typeof venue_name !== 'string' || !venue_name.trim()) {
      return res.status(400).json({ error: 'Venue name is required.' });
    }

    const parsedCapacity =
      capacity === '' || capacity == null ? null : Number(capacity);

    const parsedRentalCost =
      rental_cost === '' || rental_cost == null ? null : Number(rental_cost);

    if (
      parsedCapacity !== null &&
      (!Number.isInteger(parsedCapacity) || parsedCapacity < 0)
    ) {
      return res.status(400).json({
        error: 'Capacity must be a non-negative whole number.',
      });
    }

    if (
      parsedRentalCost !== null &&
      (!Number.isFinite(parsedRentalCost) || parsedRentalCost < 0)
    ) {
      return res.status(400).json({
        error: 'Rental cost must be a non-negative number.',
      });
    }

    const result = await pool.query(
      `UPDATE venues
       SET venue_name = $1,
           location = $2,
           capacity = $3,
           rental_cost = $4
       WHERE venue_id = $5
       RETURNING *`,
      [
        venue_name.trim(),
        location || '',
        parsedCapacity,
        parsedRentalCost,
        venueId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Venue not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update venue error:', error.message);
    res.status(500).json({ error: 'Could not update venue.' });
  }
});


 // ==========================================
 // 9. DELETE VENUE
 // ==========================================
app.delete('/api/venues/:id', async (req, res) => {
  try {
    const venueId = Number(req.params.id);

    if (!Number.isInteger(venueId) || venueId <= 0) {
      return res.status(400).json({ error: 'Invalid venue ID.' });
    }

    const result = await pool.query(
      'DELETE FROM venues WHERE venue_id = $1 RETURNING *',
      [venueId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Venue not found.' });
    }

    res.json({
      message: 'Venue deleted successfully.',
      venue: result.rows[0],
    });
  } catch (error) {
    console.error('Delete venue error:', error.message);

    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This venue is linked to another record and cannot be deleted yet.',
      });
    }

    res.status(500).json({ error: 'Could not delete venue.' });
  }
});

 // ==========================================
 // 10. RESOURCE MANAGEMENT
 // ==========================================

// GET ALL RESOURCES
app.get('/api/resources', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM resources ORDER BY resource_id'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch resources error:', error.message);
    res.status(500).json({ error: 'Could not fetch resources.' });
  }
});

// ADD RESOURCE
app.post('/api/resources', async (req, res) => {
  try {
    const {
      resource_name,
      resource_type,
      quantity_available,
      unit_cost,
    } = req.body;

    if (!resource_name?.trim() || !resource_type?.trim()) {
      return res.status(400).json({
        error: 'Resource name and type are required.',
      });
    }

    const quantity = Number(quantity_available);
    const cost = Number(unit_cost);

    if (
      quantity_available === '' ||
      quantity_available == null ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return res.status(400).json({
        error: 'Quantity must be a non-negative whole number.',
      });
    }

    if (
      unit_cost === '' ||
      unit_cost == null ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      return res.status(400).json({
        error: 'Unit cost must be a non-negative number.',
      });
    }

    const result = await pool.query(
      `INSERT INTO resources
        (resource_name, resource_type, quantity_available, unit_cost)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [resource_name.trim(), resource_type.trim(), quantity, cost]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add resource error:', error.message);
    res.status(500).json({ error: 'Could not add resource.' });
  }
});

// EDIT RESOURCE
app.put('/api/resources/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    const {
      resource_name,
      resource_type,
      quantity_available,
      unit_cost,
    } = req.body;

    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ error: 'Invalid resource ID.' });
    }

    if (!resource_name?.trim() || !resource_type?.trim()) {
      return res.status(400).json({
        error: 'Resource name and type are required.',
      });
    }

    const quantity = Number(quantity_available);
    const cost = Number(unit_cost);

    if (
      quantity_available === '' ||
      quantity_available == null ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return res.status(400).json({
        error: 'Quantity must be a non-negative whole number.',
      });
    }

    if (
      unit_cost === '' ||
      unit_cost == null ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      return res.status(400).json({
        error: 'Unit cost must be a non-negative number.',
      });
    }

    const result = await pool.query(
      `UPDATE resources
       SET resource_name = $1,
           resource_type = $2,
           quantity_available = $3,
           unit_cost = $4
       WHERE resource_id = $5
       RETURNING *`,
      [resource_name.trim(), resource_type.trim(), quantity, cost, resourceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update resource error:', error.message);
    res.status(500).json({ error: 'Could not update resource.' });
  }
});

// DELETE RESOURCE
app.delete('/api/resources/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id);

    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ error: 'Invalid resource ID.' });
    }

    const result = await pool.query(
      'DELETE FROM resources WHERE resource_id = $1 RETURNING *',
      [resourceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    res.json({ message: 'Resource deleted successfully.' });
  } catch (error) {
    console.error('Delete resource error:', error.message);

    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This resource is assigned to an event and cannot be deleted yet.',
      });
    }

    res.status(500).json({ error: 'Could not delete resource.' });
  }
});
// ==========================================
// 10A. EVENT RESOURCE ALLOCATION
// ==========================================
// event_resources links events and resources. quantity_allocated records how many
// units of a resource are reserved for a particular event.
app.get('/api/resource-allocations', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE event_resources
      ADD COLUMN IF NOT EXISTS quantity_allocated INTEGER NOT NULL DEFAULT 1`);
    const result = await pool.query(`
      SELECT er.event_id, er.resource_id, er.quantity_allocated,
             e.event_name, r.resource_name, r.resource_type,
             r.quantity_available, r.unit_cost
      FROM event_resources er
      JOIN events e ON e.event_id = er.event_id
      JOIN resources r ON r.resource_id = er.resource_id
      ORDER BY e.event_name, r.resource_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch resource allocations error:', error.message);
    res.status(500).json({ error: 'Could not fetch resource allocations. Check that event_resources has event_id and resource_id columns.' });
  }
});

app.post('/api/resource-allocations', async (req, res) => {
  const client = await pool.connect();
  try {
    const eventId = Number(req.body.event_id);
    const resourceId = Number(req.body.resource_id);
    const quantity = Number(req.body.quantity_allocated);
    if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ error: 'Choose a valid event and resource.' });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Allocated quantity must be a whole number of at least 1.' });
    }

    await client.query('BEGIN');
    await client.query(`ALTER TABLE event_resources ADD COLUMN IF NOT EXISTS quantity_allocated INTEGER NOT NULL DEFAULT 1`);
    const resourceResult = await client.query(
      'SELECT quantity_available FROM resources WHERE resource_id = $1 FOR UPDATE', [resourceId]
    );
    if (!resourceResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resource not found.' });
    }
    const eventResult = await client.query('SELECT event_id FROM events WHERE event_id = $1', [eventId]);
    if (!eventResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found.' });
    }
    const existingResult = await client.query(
      'SELECT quantity_allocated FROM event_resources WHERE event_id = $1 AND resource_id = $2', [eventId, resourceId]
    );
    const existingForPair = existingResult.rows.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0);
    const totalResult = await client.query(
      'SELECT COALESCE(SUM(quantity_allocated), 0) AS total FROM event_resources WHERE resource_id = $1', [resourceId]
    );
    const totalAllocated = Number(totalResult.rows[0].total) - existingForPair;
    const available = Number(resourceResult.rows[0].quantity_available);
    if (totalAllocated + quantity > available) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Only ${Math.max(0, available - totalAllocated)} unit(s) of this resource are available.` });
    }
    await client.query('DELETE FROM event_resources WHERE event_id = $1 AND resource_id = $2', [eventId, resourceId]);
    await client.query(
      'INSERT INTO event_resources (event_id, resource_id, quantity_allocated) VALUES ($1, $2, $3)',
      [eventId, resourceId, quantity]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Resource allocated successfully.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create resource allocation error:', error.message);
    res.status(500).json({ error: 'Could not allocate resource.' });
  } finally {
    client.release();
  }
});

app.put('/api/resource-allocations/:eventId/:resourceId', async (req, res) => {
  const client = await pool.connect();
  try {
    const eventId = Number(req.params.eventId);
    const resourceId = Number(req.params.resourceId);
    const quantity = Number(req.body.quantity_allocated);
    if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ error: 'Invalid allocation.' });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Allocated quantity must be a whole number of at least 1.' });
    }
    await client.query('BEGIN');
    await client.query(`ALTER TABLE event_resources ADD COLUMN IF NOT EXISTS quantity_allocated INTEGER NOT NULL DEFAULT 1`);
    const resourceResult = await client.query('SELECT quantity_available FROM resources WHERE resource_id = $1 FOR UPDATE', [resourceId]);
    if (!resourceResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resource not found.' });
    }
    const existingResult = await client.query('SELECT quantity_allocated FROM event_resources WHERE event_id = $1 AND resource_id = $2', [eventId, resourceId]);
    if (!existingResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Allocation not found.' });
    }
    const currentPairTotal = existingResult.rows.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0);
    const totalResult = await client.query('SELECT COALESCE(SUM(quantity_allocated), 0) AS total FROM event_resources WHERE resource_id = $1', [resourceId]);
    const otherAllocated = Number(totalResult.rows[0].total) - currentPairTotal;
    const available = Number(resourceResult.rows[0].quantity_available);
    if (otherAllocated + quantity > available) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Only ${Math.max(0, available - otherAllocated)} unit(s) of this resource are available.` });
    }
    await client.query('DELETE FROM event_resources WHERE event_id = $1 AND resource_id = $2', [eventId, resourceId]);
    await client.query('INSERT INTO event_resources (event_id, resource_id, quantity_allocated) VALUES ($1, $2, $3)', [eventId, resourceId, quantity]);
    await client.query('COMMIT');
    res.json({ message: 'Allocation updated successfully.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update resource allocation error:', error.message);
    res.status(500).json({ error: 'Could not update allocation.' });
  } finally {
    client.release();
  }
});

app.delete('/api/resource-allocations/:eventId/:resourceId', async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);
    const resourceId = Number(req.params.resourceId);
    if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ error: 'Invalid allocation.' });
    }
    const result = await pool.query('DELETE FROM event_resources WHERE event_id = $1 AND resource_id = $2 RETURNING event_id', [eventId, resourceId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Allocation not found.' });
    res.json({ message: 'Allocation removed successfully.' });
  } catch (error) {
    console.error('Delete resource allocation error:', error.message);
    res.status(500).json({ error: 'Could not remove allocation.' });
  }
});

// ==========================================
// 11. ATTENDEE MANAGEMENT
// ==========================================

// GET ALL ATTENDEES (newest first)
// Get all attendees
app.get("/api/attendees", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM attendees ORDER BY attendee_id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching attendees:", error);
    res.status(500).json({ error: "Failed to fetch attendees" });
  }
});

// Add an attendee
app.post("/api/attendees", async (req, res) => {
  try {
    const { full_name, email, phone } = req.body;

    const result = await pool.query(
      `INSERT INTO attendees (full_name, email, phone)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [full_name, email, phone]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error adding attendee:", error);
    res.status(500).json({ error: "Failed to add attendee" });
  }
});

// Update an attendee
app.put("/api/attendees/:id", async (req, res) => {
  try {
    const { full_name, email, phone } = req.body;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE attendees
       SET full_name = $1, email = $2, phone = $3
       WHERE attendee_id = $4
       RETURNING *`,
      [full_name, email, phone, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendee not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating attendee:", error);
    res.status(500).json({ error: "Failed to update attendee" });
  }
});

// Delete an attendee
app.delete("/api/attendees/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM attendees WHERE attendee_id = $1 RETURNING *",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendee not found" });
    }

    res.json({ message: "Attendee deleted successfully" });
  } catch (error) {
    console.error("Error deleting attendee:", error);
    res.status(500).json({ error: "Failed to delete attendee" });
  }
});


/* ========== REGISTRATION, TICKETS AND ATTENDANCE API ========== */

// List registrations with attendee and event information.
app.get('/api/registrations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.registration_id, r.event_id, r.attendee_id,
             r.registration_date, r.ticket_code, r.checked_in,
             r.attendee_category, r.registration_status,
             a.full_name, a.email, a.phone, e.event_name
      FROM registrations r
      JOIN attendees a ON a.attendee_id = r.attendee_id
      JOIN events e ON e.event_id = r.event_id
      ORDER BY r.registration_id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch registrations error:', error.message);
    res.status(500).json({ error: 'Could not fetch registrations.' });
  }
});

// Register attendee and create a unique ticket code.
app.post('/api/registrations', async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { full_name, email, phone, event_id, attendee_category = 'general' } = req.body;
    const name = typeof full_name === 'string' ? full_name.trim() : '';
    const attendeeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const attendeePhone = typeof phone === 'string' ? phone.trim() : '';
    const eventId = Number(event_id);
    const allowedCategories = ['general', 'vip', 'guest', 'speaker', 'sponsor', 'volunteer'];
    const category = typeof attendee_category === 'string' ? attendee_category.trim().toLowerCase() : '';

    if (!name || !attendeeEmail || !attendeePhone || !event_id) {
      return res.status(400).json({ error: 'Name, email, phone, and event are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: 'Select a valid event.' });
    }
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Select a valid attendee category.' });
    }

    await client.query('BEGIN');
    transactionStarted = true;
    const eventResult = await client.query(
      'SELECT event_id, event_name FROM events WHERE event_id = $1', [eventId]
    );
    if (!eventResult.rowCount) {
      await client.query('ROLLBACK'); transactionStarted = false;
      return res.status(404).json({ error: 'Selected event was not found.' });
    }

    // Match existing attendee by email; otherwise create a new attendee.
    let attendeeResult = await client.query(
      `SELECT attendee_id, full_name, email, phone
       FROM attendees WHERE LOWER(email) = $1 LIMIT 1`, [attendeeEmail]
    );
    let attendee;
    if (attendeeResult.rowCount) {
      attendee = attendeeResult.rows[0];
    } else {
      attendeeResult = await client.query(
        `INSERT INTO attendees (full_name, email, phone)
         VALUES ($1, $2, $3)
         RETURNING attendee_id, full_name, email, phone`,
        [name, attendeeEmail, attendeePhone]
      );
      attendee = attendeeResult.rows[0];
    }

    const duplicate = await client.query(
      'SELECT registration_id FROM registrations WHERE event_id = $1 AND attendee_id = $2',
      [eventId, attendee.attendee_id]
    );
    if (duplicate.rowCount) {
      await client.query('ROLLBACK'); transactionStarted = false;
      return res.status(409).json({ error: 'This attendee is already registered for this event.' });
    }

    const ticketCode = randomUUID();
    const registrationResult = await client.query(
      `INSERT INTO registrations
        (event_id, attendee_id, registration_date, ticket_code, checked_in,
         attendee_category, registration_status)
       VALUES ($1, $2, NOW(), $3, FALSE, $4, 'active')
       RETURNING registration_id, event_id, attendee_id, registration_date,
                 ticket_code, checked_in, attendee_category, registration_status`,
      [eventId, attendee.attendee_id, ticketCode, category]
    );
    await client.query('COMMIT'); transactionStarted = false;
    res.status(201).json({
      message: 'Registration successful.', attendee,
      event: eventResult.rows[0], registration: registrationResult.rows[0],
    });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    console.error('Registration error:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This attendee is already registered for this event.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  } finally {
    client.release();
  }
});

// Verify a ticket by its unique ticket code.
app.get('/api/registrations/ticket/:ticketCode', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.registration_id, r.ticket_code, r.registration_status,
              r.checked_in, a.full_name, a.email, e.event_name
       FROM registrations r
       JOIN attendees a ON a.attendee_id = r.attendee_id
       JOIN events e ON e.event_id = r.event_id
       WHERE r.ticket_code = $1`, [req.params.ticketCode]
    );
    if (!result.rowCount) return res.status(404).json({ valid: false, error: 'Ticket not found.' });
    const ticket = result.rows[0];
    const valid = ticket.registration_status === 'active';
    res.json({ valid, ticket, message: valid ? 'Ticket is valid.' : 'This ticket has been cancelled.' });
  } catch (error) {
    console.error('Ticket verification error:', error.message);
    res.status(500).json({ error: 'Could not verify ticket.' });
  }
});

// Check in once only; cancelled registrations cannot check in.
app.post('/api/registrations/:id/check-in', async (req, res) => {
  try {
    const registrationId = Number(req.params.id);
    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({ error: 'Invalid registration ID.' });
    }
    const result = await pool.query(
      `UPDATE registrations
       SET checked_in = TRUE
       WHERE registration_id = $1
         AND registration_status = 'active'
         AND checked_in = FALSE
       RETURNING registration_id, checked_in`, [registrationId]
    );
    if (!result.rowCount) {
      const current = await pool.query(
        'SELECT registration_status, checked_in FROM registrations WHERE registration_id = $1', [registrationId]
      );
      if (!current.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      if (current.rows[0].registration_status !== 'active') {
        return res.status(409).json({ error: 'Cancelled registrations cannot be checked in.' });
      }
      return res.status(409).json({ error: 'This attendee has already checked in.' });
    }
    res.json({ message: 'Attendee checked in successfully.', registration: result.rows[0] });
  } catch (error) {
    console.error('Check-in error:', error.message);
    res.status(500).json({ error: 'Could not check in attendee.' });
  }
});

// Cancel a registration; the ticket is no longer valid.
app.post('/api/registrations/:id/cancel', async (req, res) => {
  try {
    const registrationId = Number(req.params.id);
    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({ error: 'Invalid registration ID.' });
    }
    const result = await pool.query(
      `UPDATE registrations
       SET registration_status = 'cancelled'
       WHERE registration_id = $1 AND registration_status = 'active'
       RETURNING registration_id, registration_status, checked_in`, [registrationId]
    );
    if (!result.rowCount) {
      const current = await pool.query(
        'SELECT registration_status FROM registrations WHERE registration_id = $1', [registrationId]
      );
      if (!current.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      return res.status(409).json({ error: 'This registration is already cancelled.' });
    }
    res.json({ message: 'Registration cancelled. Its ticket is now invalid.', registration: result.rows[0] });
  } catch (error) {
    console.error('Cancel registration error:', error.message);
    res.status(500).json({ error: 'Could not cancel registration.' });
  }
});

// Attendance totals for each event.
app.get('/api/registrations/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.event_id, e.event_name,
             COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active') AS total_registered,
             COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active' AND r.checked_in = TRUE) AS present,
             COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active' AND r.checked_in = FALSE) AS absent,
             COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'cancelled') AS cancelled,
             CASE WHEN COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active') = 0 THEN 0
                  ELSE ROUND(100.0 * COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active' AND r.checked_in = TRUE)
                       / COUNT(r.registration_id) FILTER (WHERE r.registration_status = 'active'), 2)
             END AS attendance_percentage
      FROM events e LEFT JOIN registrations r ON r.event_id = e.event_id
      GROUP BY e.event_id, e.event_name ORDER BY e.event_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Attendance stats error:', error.message);
    res.status(500).json({ error: 'Could not fetch attendance statistics.' });
  }
});

/* ========== VENDORS API ========== */

// Get all vendors
app.get("/api/vendors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vendor_id, vendor_name, service_type,
              contact_email, contact_phone
       FROM vendors
       ORDER BY vendor_id DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch vendors error:", error);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

// Add vendor
app.post("/api/vendors", async (req, res) => {
  try {
    const {
      vendor_name,
      service_type,
      contact_email,
      contact_phone
    } = req.body;

    if (!vendor_name || !vendor_name.trim()) {
      return res.status(400).json({
        error: "Vendor name is required"
      });
    }

    const result = await pool.query(
      `INSERT INTO vendors
         (vendor_name, service_type, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4)
       RETURNING vendor_id, vendor_name, service_type,
                 contact_email, contact_phone`,
      [
        vendor_name.trim(),
        service_type || "",
        contact_email || "",
        contact_phone || ""
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Add vendor error:", error);
    res.status(500).json({ error: "Failed to add vendor" });
  }
});

// Update vendor
app.put("/api/vendors/:id", async (req, res) => {
  try {
    const {
      vendor_name,
      service_type,
      contact_email,
      contact_phone
    } = req.body;

    if (!vendor_name || !vendor_name.trim()) {
      return res.status(400).json({
        error: "Vendor name is required"
      });
    }

    const result = await pool.query(
      `UPDATE vendors
       SET vendor_name = $1,
           service_type = $2,
           contact_email = $3,
           contact_phone = $4
       WHERE vendor_id = $5
       RETURNING vendor_id, vendor_name, service_type,
                 contact_email, contact_phone`,
      [
        vendor_name.trim(),
        service_type || "",
        contact_email || "",
        contact_phone || "",
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update vendor error:", error);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// Delete vendor
app.delete("/api/vendors/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM vendors
       WHERE vendor_id = $1
       RETURNING vendor_id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json({ message: "Vendor deleted successfully" });
  } catch (error) {
    console.error("Delete vendor error:", error);

    res.status(500).json({
      error: "Failed to delete vendor. This vendor may be linked to an event."
    });
  }
});


/* ========== VENDOR ASSIGNMENTS API ========== */

// List vendors assigned to events
app.get("/api/vendor-assignments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ev.event_id,
        ev.vendor_id,
        ev.agreed_cost,
        ev.service_status,
        e.event_name,
        v.vendor_name,
        v.service_type
      FROM event_vendors ev
      INNER JOIN events e ON e.event_id = ev.event_id
      INNER JOIN vendors v ON v.vendor_id = ev.vendor_id
      ORDER BY ev.event_id DESC, v.vendor_name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Fetch vendor assignments error:", error);
    res.status(500).json({ error: "Failed to fetch vendor assignments" });
  }
});

// Assign a vendor to an event
app.post("/api/vendor-assignments", async (req, res) => {
  try {
    const { event_id, vendor_id, agreed_cost, service_status } = req.body;
    const status = service_status || "assigned";
    const allowedStatuses = ["assigned", "confirmed", "completed", "cancelled"];

    if (!Number.isInteger(Number(event_id)) || Number(event_id) <= 0 ||
        !Number.isInteger(Number(vendor_id)) || Number(vendor_id) <= 0) {
      return res.status(400).json({ error: "Valid event and vendor are required" });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid service status" });
    }
    if (agreed_cost !== undefined && (Number.isNaN(Number(agreed_cost)) || Number(agreed_cost) < 0)) {
      return res.status(400).json({ error: "Agreed cost must be a non-negative number" });
    }

    const result = await pool.query(`
      INSERT INTO event_vendors (event_id, vendor_id, agreed_cost, service_status)
      VALUES ($1, $2, $3, $4)
      RETURNING event_id, vendor_id, agreed_cost, service_status
    `, [Number(event_id), Number(vendor_id), agreed_cost ?? 0, status]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create vendor assignment error:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "This vendor is already assigned to this event" });
    }
    if (error.code === "23503") {
      return res.status(400).json({ error: "Selected event or vendor does not exist" });
    }
    res.status(500).json({ error: "Failed to create vendor assignment" });
  }
});

// Update an existing event/vendor assignment (composite key)
app.put("/api/vendor-assignments/:event_id/:vendor_id", async (req, res) => {
  try {
    const { agreed_cost, service_status } = req.body;
    const status = service_status || "assigned";
    const allowedStatuses = ["assigned", "confirmed", "completed", "cancelled"];

    if (agreed_cost !== undefined && (Number.isNaN(Number(agreed_cost)) || Number(agreed_cost) < 0)) {
      return res.status(400).json({ error: "Agreed cost must be a non-negative number" });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid service status" });
    }

    const result = await pool.query(`
      UPDATE event_vendors
      SET agreed_cost = $1, service_status = $2
      WHERE event_id = $3 AND vendor_id = $4
      RETURNING event_id, vendor_id, agreed_cost, service_status
    `, [agreed_cost ?? 0, status, req.params.event_id, req.params.vendor_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor assignment not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update vendor assignment error:", error);
    res.status(500).json({ error: "Failed to update vendor assignment" });
  }
});

// Remove a vendor assignment from an event
app.delete("/api/vendor-assignments/:event_id/:vendor_id", async (req, res) => {
  try {
    const result = await pool.query(`
      DELETE FROM event_vendors
      WHERE event_id = $1 AND vendor_id = $2
      RETURNING event_id, vendor_id
    `, [req.params.event_id, req.params.vendor_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor assignment not found" });
    }
    res.json({ message: "Vendor assignment deleted successfully", assignment: result.rows[0] });
  } catch (error) {
    console.error("Delete vendor assignment error:", error);
    res.status(500).json({ error: "Failed to delete vendor assignment" });
  }
});


/* ========== VENDOR ASSIGNMENTS API ========== */

// GET: List all vendor assignments
app.get("/api/vendor-assignments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ev.event_id,
        ev.vendor_id,
        ev.agreed_cost,
        ev.service_status,
        e.event_name,
        e.start_date,
        e.end_date,
        v.vendor_name,
        v.service_type
      FROM event_vendors ev
      INNER JOIN events e ON e.event_id = ev.event_id
      INNER JOIN vendors v ON v.vendor_id = ev.vendor_id
      ORDER BY ev.event_id DESC, v.vendor_name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch vendor assignments error:", error.message);
    res.status(500).json({
      error: "Failed to fetch vendor assignments"
    });
  }
});


// Shared validation for adding and editing assignments
async function validateVendorAssignment(
  client,
  eventId,
  vendorId,
  agreedCost,
  status
) {
  // Check that event and vendor exist.
  const eventResult = await client.query(
    `SELECT event_id, start_date, end_date
     FROM events
     WHERE event_id = $1
     FOR UPDATE`,
    [eventId]
  );

  if (!eventResult.rowCount) {
    return "Selected event does not exist.";
  }

  const vendorResult = await client.query(
    `SELECT vendor_id, contract_start_date, contract_end_date
     FROM vendors
     WHERE vendor_id = $1
     FOR UPDATE`,
    [vendorId]
  );

  if (!vendorResult.rowCount) {
    return "Selected vendor does not exist.";
  }

  // Cancelled assignments do not require active-service validation.
  if (status === "cancelled") {
    return null;
  }

  const event = eventResult.rows[0];
  const vendor = vendorResult.rows[0];

  const eventStart = new Date(event.start_date);
  const eventEnd = new Date(event.end_date);

  // The event end_date in this project is stored as the
  // day after the event date, so use the previous day.
  const eventLastDay = new Date(eventEnd);
  eventLastDay.setDate(eventLastDay.getDate() - 1);

  // Validate vendor contract dates.
  if (
    vendor.contract_start_date &&
    eventStart < new Date(vendor.contract_start_date)
  ) {
    return "The vendor contract starts after this event begins.";
  }

  if (
    vendor.contract_end_date &&
    eventLastDay > new Date(vendor.contract_end_date)
  ) {
    return "The vendor contract expires before this event ends.";
  }

  // Prevent assigning the same vendor to overlapping events.
  const overlapResult = await client.query(
    `SELECT e.event_name
     FROM event_vendors ev
     JOIN events e ON e.event_id = ev.event_id
     WHERE ev.vendor_id = $1
       AND ev.event_id <> $2
       AND LOWER(COALESCE(ev.service_status, 'assigned')) <> 'cancelled'
       AND e.start_date < $4
       AND e.end_date > $3
     LIMIT 1`,
    [vendorId, eventId, event.start_date, event.end_date]
  );

  if (overlapResult.rowCount) {
    return `This vendor is already assigned to another overlapping event: ${overlapResult.rows[0].event_name}.`;
  }

  // Calculate the event's available budget.
  const budgetResult = await client.query(
    `SELECT
       COALESCE(SUM(b.planned_budget), 0) AS planned_budget,
       COALESCE(SUM(b.sponsorship_revenue), 0) AS sponsorship
     FROM budgets b
     WHERE b.event_id = $1`,
    [eventId]
  );

  const expenseResult = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_expenses
     FROM expenses
     WHERE event_id = $1`,
    [eventId]
  );

  // Exclude cancelled assignments and this vendor's existing
  // assignment so editing does not count its old cost twice.
  const otherVendorResult = await client.query(
    `SELECT COALESCE(SUM(agreed_cost), 0) AS other_vendor_cost
     FROM event_vendors
     WHERE event_id = $1
       AND vendor_id <> $2
       AND LOWER(COALESCE(service_status, 'assigned')) <> 'cancelled'`,
    [eventId, vendorId]
  );

  const plannedBudget = Number(budgetResult.rows[0].planned_budget);
  const sponsorship = Number(budgetResult.rows[0].sponsorship);
  const expenses = Number(expenseResult.rows[0].total_expenses);
  const otherVendorCost = Number(otherVendorResult.rows[0].other_vendor_cost);

  const remainingBudget =
    plannedBudget + sponsorship - expenses - otherVendorCost;

  if (agreedCost > remainingBudget) {
    return `Insufficient event budget. Remaining budget is ${remainingBudget.toFixed(2)}.`;
  }

  return null;
}


// POST: Assign a vendor to an event
app.post("/api/vendor-assignments", async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const {
      event_id,
      vendor_id,
      agreed_cost,
      service_status
    } = req.body;

    const eventId = Number(event_id);
    const vendorId = Number(vendor_id);
    const cost = agreed_cost === undefined || agreed_cost === ""
      ? 0
      : Number(agreed_cost);

    const status = service_status || "assigned";
    const allowedStatuses = [
      "assigned",
      "confirmed",
      "completed",
      "cancelled"
    ];

    if (
      !Number.isInteger(eventId) || eventId <= 0 ||
      !Number.isInteger(vendorId) || vendorId <= 0
    ) {
      return res.status(400).json({
        error: "Valid event and vendor are required."
      });
    }

    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({
        error: "Agreed cost must be a non-negative number."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid service status."
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const validationError = await validateVendorAssignment(
      client,
      eventId,
      vendorId,
      cost,
      status
    );

    if (validationError) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: validationError
      });
    }

    const result = await client.query(
      `INSERT INTO event_vendors
       (event_id, vendor_id, agreed_cost, service_status)
       VALUES ($1, $2, $3, $4)
       RETURNING event_id, vendor_id, agreed_cost, service_status`,
      [eventId, vendorId, cost, status]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.status(201).json({
      message: "Vendor assigned successfully.",
      assignment: result.rows[0]
    });

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Create vendor assignment error:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "This vendor is already assigned to this event."
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error: "Selected event or vendor does not exist."
      });
    }

    res.status(500).json({
      error: "Failed to create vendor assignment."
    });
  } finally {
    client.release();
  }
});


// PUT: Update an existing vendor assignment
app.put("/api/vendor-assignments/:event_id/:vendor_id", async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const eventId = Number(req.params.event_id);
    const vendorId = Number(req.params.vendor_id);

    const {
      agreed_cost,
      service_status
    } = req.body;

    const cost = agreed_cost === undefined || agreed_cost === ""
      ? 0
      : Number(agreed_cost);

    const status = service_status || "assigned";

    const allowedStatuses = [
      "assigned",
      "confirmed",
      "completed",
      "cancelled"
    ];

    if (
      !Number.isInteger(eventId) || eventId <= 0 ||
      !Number.isInteger(vendorId) || vendorId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid event or vendor ID."
      });
    }

    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({
        error: "Agreed cost must be a non-negative number."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid service status."
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const existing = await client.query(
      `SELECT event_id
       FROM event_vendors
       WHERE event_id = $1 AND vendor_id = $2`,
      [eventId, vendorId]
    );

    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        error: "Vendor assignment not found."
      });
    }

    const validationError = await validateVendorAssignment(
      client,
      eventId,
      vendorId,
      cost,
      status
    );

    if (validationError) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: validationError
      });
    }

    const result = await client.query(
      `UPDATE event_vendors
       SET agreed_cost = $1,
           service_status = $2
       WHERE event_id = $3 AND vendor_id = $4
       RETURNING event_id, vendor_id, agreed_cost, service_status`,
      [cost, status, eventId, vendorId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      message: "Vendor assignment updated successfully.",
      assignment: result.rows[0]
    });

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Update vendor assignment error:", error.message);

    res.status(500).json({
      error: "Failed to update vendor assignment."
    });
  } finally {
    client.release();
  }
});


// DELETE: Remove a vendor assignment
app.delete("/api/vendor-assignments/:event_id/:vendor_id", async (req, res) => {
  try {
    const eventId = Number(req.params.event_id);
    const vendorId = Number(req.params.vendor_id);

    if (
      !Number.isInteger(eventId) || eventId <= 0 ||
      !Number.isInteger(vendorId) || vendorId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid event or vendor ID."
      });
    }

    const result = await pool.query(
      `DELETE FROM event_vendors
       WHERE event_id = $1 AND vendor_id = $2
       RETURNING event_id, vendor_id`,
      [eventId, vendorId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Vendor assignment not found."
      });
    }

    res.json({
      message: "Vendor assignment deleted successfully.",
      assignment: result.rows[0]
    });

  } catch (error) {
    console.error("Delete vendor assignment error:", error.message);

    res.status(500).json({
      error: "Failed to delete vendor assignment."
    });
  }
});


// ==========================================
// REPORTS SUMMARY
// ==========================================
app.get("/api/reports/summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM events) AS total_events,
        (SELECT COUNT(*) FROM attendees) AS total_attendees,
        (SELECT COUNT(*)
         FROM registrations
         WHERE registration_status = 'active') AS total_registrations,

        (SELECT COUNT(*)
         FROM registrations
         WHERE registration_status = 'active'
           AND checked_in = TRUE) AS total_checked_in,

        (SELECT COALESCE(SUM(planned_budget), 0)
         FROM budgets) AS total_planned_budget,

        (SELECT COALESCE(SUM(sponsorship_revenue), 0)
         FROM budgets) AS total_sponsorship,

        (SELECT COALESCE(SUM(amount), 0)
         FROM expenses) AS total_expenses,

        (SELECT COALESCE(SUM(agreed_cost), 0)
         FROM event_vendors
         WHERE LOWER(COALESCE(service_status, 'assigned')) <> 'cancelled')
         AS total_vendor_cost
    `);

    const row = result.rows[0];

    const plannedBudget = Number(row.total_planned_budget);
    const sponsorship = Number(row.total_sponsorship);
    const expenses = Number(row.total_expenses);
    const vendorCost = Number(row.total_vendor_cost);

    const totalAvailableBudget = plannedBudget + sponsorship;
    const totalSpent = expenses + vendorCost;
    const remainingBudget = totalAvailableBudget - totalSpent;

    const utilizationPercentage =
      totalAvailableBudget > 0
        ? Number(((totalSpent / totalAvailableBudget) * 100).toFixed(2))
        : 0;

   res.json({
  total_events: Number(row.total_events),
  total_attendees: Number(row.total_attendees),
  planned_budget: plannedBudget,
  total_expenses: expenses,
  total_registrations: Number(row.total_registrations),
  checked_in: Number(row.total_checked_in),
  sponsorship_revenue: sponsorship,
});

  } catch (error) {
    console.error("Reports summary error:", error.message);

    res.status(500).json({
      error: "Could not fetch reports summary."
    });
  }
});


app.get("/api/reports/events", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.event_id,
        e.event_name,
        e.start_date,
        COALESCE(b.planned_budget, 0) AS planned_budget,
        COALESCE(b.sponsorship_revenue, 0) AS sponsorship_revenue,
        COALESCE(x.total_expenses, 0) AS total_expenses,
        COALESCE(r.total_registrations, 0) AS total_registrations,
        COALESCE(r.checked_in, 0) AS checked_in
      FROM events e
      LEFT JOIN (
        SELECT
          event_id,
          SUM(planned_budget) AS planned_budget,
          SUM(sponsorship_revenue) AS sponsorship_revenue
        FROM budgets
        GROUP BY event_id
      ) b ON b.event_id = e.event_id
      LEFT JOIN (
        SELECT
          event_id,
          SUM(amount) AS total_expenses
        FROM expenses
        GROUP BY event_id
      ) x ON x.event_id = e.event_id
      LEFT JOIN (
        SELECT
          event_id,
          COUNT(*) FILTER (
            WHERE registration_status = 'active'
          ) AS total_registrations,
          COUNT(*) FILTER (
            WHERE registration_status = 'active'
              AND checked_in = TRUE
          ) AS checked_in
        FROM registrations
        GROUP BY event_id
      ) r ON r.event_id = e.event_id
      ORDER BY e.start_date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Event reports error:", error);
    res.status(500).json({
      message: "Failed to load event reports",
    });
  }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(
    `EventSphere backend running on http://localhost:${PORT}`
  );
});
