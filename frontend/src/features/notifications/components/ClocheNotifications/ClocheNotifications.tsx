import { Tag } from "@axa-fr/canopee-react/distributeur";
import notificationsIcon from "@material-symbols/svg-400/outlined/notifications.svg";

import { formatDateHeure } from "../../../../helpers/formatDateHeure";
import "./ClocheNotifications.css";
import { useClocheNotifications } from "./useClocheNotifications";

const ID_PANNEAU = "cloche-notifications-panneau";
const ID_TITRE = "cloche-notifications-titre";

const libelleBadge = (nonVues: number): string => (nonVues > 9 ? "9+" : String(nonVues));

const libelleAriaTrigger = (nonVues: number): string => {
  if (nonVues === 0) {
    return "Notifications";
  }
  return `Notifications, ${nonVues} nouvelle${nonVues > 1 ? "s" : ""}`;
};

export const ClocheNotifications = () => {
  const {
    ouvert,
    basculer,
    triggerRef,
    panneauRef,
    positionPanneau,
    notifications,
    dAutresRestent,
    afficherPlus,
    nonVues,
    idsNouveauPendantOuverture,
    ouvrirDemande,
  } = useClocheNotifications();

  return (
    <div className="cloche-notifications">
      <button
        ref={triggerRef}
        type="button"
        className="cloche-notifications__trigger"
        aria-label={libelleAriaTrigger(nonVues)}
        aria-haspopup="true"
        aria-expanded={ouvert}
        aria-controls={ID_PANNEAU}
        onClick={basculer}
      >
        <img src={notificationsIcon} alt="" aria-hidden="true" className="cloche-notifications__icone" />
        {nonVues > 0 && (
          <Tag variant="error" className="cloche-notifications__badge">
            {libelleBadge(nonVues)}
          </Tag>
        )}
      </button>

      {ouvert && (
        <div
          id={ID_PANNEAU}
          ref={panneauRef}
          className="cloche-notifications__panneau"
          role="region"
          aria-labelledby={ID_TITRE}
          style={positionPanneau ? { top: positionPanneau.top, right: positionPanneau.right } : undefined}
        >
          <p id={ID_TITRE} className="cloche-notifications__titre">
            Notifications
          </p>

          {notifications.length === 0 && <p className="cloche-notifications__vide">Aucune notification.</p>}

          <ul className="cloche-notifications__liste">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className="cloche-notifications__item"
                  onClick={() => ouvrirDemande(notification.demande_id)}
                >
                  {idsNouveauPendantOuverture.has(notification.id) && (
                    <Tag variant="information" className="cloche-notifications__item-nouveau">
                      Nouveau
                    </Tag>
                  )}
                  <p className="cloche-notifications__item-titre">{notification.titre}</p>
                  <p>{notification.message}</p>
                  <p className="cloche-notifications__item-date">{formatDateHeure(notification.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>

          {dAutresRestent && (
            <button type="button" className="cloche-notifications__afficher-plus" onClick={afficherPlus}>
              Afficher plus
            </button>
          )}
        </div>
      )}
    </div>
  );
};
