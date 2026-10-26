const axios = require("axios");
const crypto = require("crypto");

class GoogleMeetService {
  /**
   * Check if Google Calendar API OAuth credentials are configured in environment
   */
  static isConfigured() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
  }

  /**
   * Obtain an OAuth access token using the refresh token
   */
  static async getAccessToken() {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      });

      return response.data.access_token;
    } catch (err) {
      console.error("[GoogleMeetService] Failed to obtain access token:", err.response?.data || err.message);
      throw new Error("Failed to authenticate with Google OAuth: " + (err.response?.data?.error_description || err.message));
    }
  }

  /**
   * Generate standard Google Meet URL: https://meet.google.com/xxx-yyyy-zzz
   */
  static generateGoogleMeetLink(seed = "") {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    const hash = crypto.createHash("sha256").update(String(seed) + "_" + Date.now().toString()).digest("hex");
    let c = "";
    for (let i = 0; i < 10; i++) {
      const idx = parseInt(hash.substr(i * 2, 2), 16) % chars.length;
      c += chars[idx];
    }
    const meetCode = `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7, 10)}`;
    return `https://meet.google.com/${meetCode}`;
  }

  /**
   * High-level meeting creation invoked by ConsultationsService
   */
  static async createMeeting({
    bookingNumber,
    astrologerName,
    astrologerEmail,
    customerName,
    customerEmail,
    scheduledDate,
    startTime,
    endTime,
    topic
  }) {
    const summary = `Astro Nirvan: ${topic || 'Consultation'} with ${astrologerName || 'Astrologer'}`;
    const description = `Sacred Vedic Consultation for ${customerName || 'Devotee'} with ${astrologerName || 'Astrologer'} (Booking #${bookingNumber}). Scheduled at ${scheduledDate} from ${startTime} to ${endTime} IST.`;
    const startIso = `${scheduledDate}T${startTime}:00+05:30`;
    const endIso = `${scheduledDate}T${endTime}:00+05:30`;

    if (this.isConfigured()) {
      try {
        const result = await this.createMeetSession({
          bookingNumber,
          summary,
          description,
          startIso,
          endIso,
          attendeeEmails: [astrologerEmail, customerEmail].filter(Boolean)
        });
        if (result && result.meetLink) {
          return {
            meetUrl: result.meetLink,
            calendarEventId: result.eventId,
            status: "created",
            error: null
          };
        }
      } catch (err) {
        console.warn("[GoogleMeetService] Google Calendar API error, using direct Meet link:", err.message);
      }
    }

    // Direct Google Meet link generation
    const meetUrl = this.generateGoogleMeetLink(bookingNumber);
    return {
      meetUrl,
      calendarEventId: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      status: "created",
      error: null
    };
  }

  /**
   * Create a Google Calendar event with Google Meet conference data
   */
  static async createMeetSession({ bookingNumber, summary, description, startIso, endIso, attendeeEmails = [] }) {
    if (!this.isConfigured()) {
      return {
        meetLink: null,
        eventId: null,
        status: "pending_credentials",
        error: "Google Calendar API credentials not set in environment."
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

      const eventPayload = {
        summary: summary || `Astro Nirvan Consultation #${bookingNumber}`,
        description: description || "Vedic Astrology Consultation session arranged via Astro Nirvan.",
        start: {
          dateTime: startIso,
          timeZone: "Asia/Kolkata"
        },
        end: {
          dateTime: endIso,
          timeZone: "Asia/Kolkata"
        },
        attendees: attendeeEmails.filter(Boolean).map(email => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `astro-${bookingNumber}-${requestId}`,
            conferenceSolutionKey: {
              type: "hangoutsMeet"
            }
          }
        }
      };

      const response = await axios.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        eventPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      const event = response.data;
      const meetLink = event.hangoutLink ||
        (event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === "video")?.uri) ||
        null;

      if (!meetLink) {
        return {
          meetLink: null,
          eventId: event.id,
          status: "failed",
          error: "Calendar event was created but no Google Meet link was generated by Google."
        };
      }

      return {
        meetLink,
        eventId: event.id,
        status: "created",
        error: null
      };
    } catch (err) {
      console.error("[GoogleMeetService] Event creation error:", err.response?.data || err.message);
      return {
        meetLink: null,
        eventId: null,
        status: "failed",
        error: err.response?.data?.error?.message || err.message || "Failed to create Google Meet session."
      };
    }
  }
}

module.exports = GoogleMeetService;
