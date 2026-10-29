import AccessControl "mo:caffeineai-authorization/access-control";

module {
  public type OldActor = {};
  public type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    gameState : { var sessionHighScore : Nat };
  };

  public func migration(_ : OldActor) : NewActor {
    {
      accessControlState = AccessControl.initState();
      gameState = { var sessionHighScore = 0 };
    };
  };
};
