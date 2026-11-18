import { audit, tx, now } from "./db.js";
import { permit, fail, required, getLead, scope } from "./core.js";
export function salesTools(a, db) {
  a.get("/partner-reviews", (req, res) => {
    permit(req.user, "partners");
    res.json(
      db
        .prepare(
          `SELECT r.*,c.name customer,p.name project,old.company original_partner,proposed.company proposed_partner FROM partner_reviews r JOIN leads l ON l.id=r.lead_id JOIN contacts c ON c.id=l.contact_id JOIN projects p ON p.id=l.project_id JOIN partners old ON old.id=r.original_id JOIN partners proposed ON proposed.id=r.proposed_id WHERE ${scope(req.user)} ORDER BY r.id DESC LIMIT 100`,
        )
        .all(),
    );
  });
  a.post("/partner-reviews/:id/resolve", (req, res) => {
    permit(req.user, "approve");
    const issue = db
      .prepare("SELECT * FROM partner_reviews WHERE id=?")
      .get(Number(req.params.id));
    if (!issue || issue.status !== "Pending")
      fail("This attribution review is no longer pending.", 409);
    const l = getLead(db, req.user, issue.lead_id),
      choice = Number(req.body.partner_id),
      reason = required(req.body.reason, "Resolution reason");
    if (![issue.original_id, issue.proposed_id].includes(choice))
      fail("Choose one of the two registered partners.");
    tx(db, () => {
      db.prepare("UPDATE partner_leads SET partner_id=? WHERE lead_id=?").run(
        choice,
        l.id,
      );
      db.prepare(
        "UPDATE partner_reviews SET status='Resolved',winner_id=?,reason=?,reviewer_id=?,resolved_at=? WHERE id=?",
      ).run(choice, reason, req.user.id, now(), issue.id);
      audit(
        db,
        req.user.id,
        l.id,
        "Partner attribution resolved",
        `Review ${issue.id}: partner ${choice} confirmed. ${reason}`,
        l.project_id,
      );
    });
    res.json({ message: "Partner attribution resolved and logged." });
  });
}
